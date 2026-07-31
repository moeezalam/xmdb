/**
 * Offline test for the TMDB mapping layer, run with:
 *   node scripts/test-enrich.ts
 *
 * The live API needs a key this repo does not ship, so `fetch` is stubbed with
 * response shapes taken from TMDB's documented schema. This checks the parts we
 * actually wrote — id resolution, trailer ranking, logo selection, field
 * mapping, auth-shape detection, and the failure paths — not TMDB itself.
 */
import assert from 'node:assert/strict'
import { enrichAll, enrichOne, validateKey } from '../src/lib/tmdb.ts'
import { enrichOne as cineOne, enrichAll as cineAll } from '../src/lib/cinemeta.ts'
import { titlesFromCsv } from '../src/lib/csv.ts'
import { buildSearchUrl, DEFAULT_TEMPLATE, PRESETS, validateTemplate } from '../src/lib/searchLink.ts'
import type { Title } from '../src/lib/types.ts'

const calls: string[] = []
let mode: 'ok' | 'nomatch' | 'boom' | 'throttle' = 'ok'
let throttled = false

const MOVIE = {
  id: 27205,
  overview: 'A thief who steals corporate secrets.',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.4,
  tagline: 'Your mind is the scene of the crime.',
  images: {
    logos: [
      { file_path: '/jp.svg', iso_639_1: 'ja' },
      { file_path: '/en.svg', iso_639_1: 'en' },
      { file_path: '/en.png', iso_639_1: 'en' },
    ],
  },
  videos: {
    results: [
      { site: 'Vimeo', type: 'Trailer', key: 'WRONG_SITE' },
      { site: 'YouTube', type: 'Clip', key: 'CLIP' },
      { site: 'YouTube', type: 'Teaser', key: 'TEASER' },
      { site: 'YouTube', type: 'Trailer', key: 'TRAILER', official: true },
    ],
  },
  credits: {
    cast: Array.from({ length: 12 }, (_, i) => ({ name: `Actor ${i}` })),
  },
}

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  calls.push(String(url))
  const u = String(url)

  if (mode === 'throttle' && !throttled) {
    throttled = true
    return { ok: false, status: 429, headers: new Headers({ 'retry-after': '0' }), json: async () => ({}) }
  }
  if (mode === 'boom') {
    return { ok: false, status: 500, headers: new Headers(), json: async () => ({}) }
  }
  if (u.includes('/configuration')) {
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ images: {} }) }
  }
  if (u.includes('/find/')) {
    const body =
      mode === 'nomatch'
        ? { movie_results: [], tv_results: [] }
        : u.includes('tt1375666')
          ? { movie_results: [{ id: 27205 }], tv_results: [] }
          : { movie_results: [], tv_results: [{ id: 1396 }] }
    return { ok: true, status: 200, headers: new Headers(), json: async () => body }
  }
  void init
  return { ok: true, status: 200, headers: new Headers(), json: async () => MOVIE }
}) as unknown as typeof fetch

const base = (over: Partial<Title>): Title => ({
  imdbId: 'tt1375666',
  title: 'Inception',
  originalTitle: 'Inception',
  year: 2010,
  titleType: 'Movie',
  isTv: false,
  imdbRating: 8.8,
  runtime: 148,
  genres: ['Action'],
  directors: ['Christopher Nolan'],
  numVotes: 1,
  releaseDate: null,
  position: 1,
  created: null,
  ...over,
})

let failures = 0
const check = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok   ${name}`))
    .catch((e) => {
      failures++
      console.log(`  FAIL ${name}\n       ${(e as Error).message}`)
    })

console.log('tmdb mapping')

await check('v3 key goes in the query string', async () => {
  calls.length = 0
  await validateKey('abc123')
  assert.ok(calls[0].includes('api_key=abc123'), calls[0])
})

await check('v4 token does not go in the query string', async () => {
  calls.length = 0
  await validateKey('eyJhbGciOiJIUzI1NiJ9.x.y')
  assert.ok(!calls[0].includes('api_key='), calls[0])
})

await check('maps a movie onto Title fields as absolute urls', async () => {
  mode = 'ok'
  const got = await enrichOne('k', base({}))
  assert.equal(got.tmdbId, 27205)
  assert.equal(got.poster, 'https://image.tmdb.org/t/p/w500/poster.jpg')
  assert.equal(got.backdrop, 'https://image.tmdb.org/t/p/w780/backdrop.jpg')
  assert.equal(got.tmdbRating, 8.4)
  assert.equal(got.tagline, 'Your mind is the scene of the crime.')
  assert.equal(got.enriched, true)
})

await check('picks the official YouTube trailer over teaser/clip/other sites', async () => {
  const got = await enrichOne('k', base({}))
  assert.equal(got.trailerKey, 'TRAILER')
})

await check('prefers the English PNG logo over SVG and other languages', async () => {
  const got = await enrichOne('k', base({}))
  assert.equal(got.logo, 'https://image.tmdb.org/t/p/w300/en.png')
})

await check('caps cast at 6 names', async () => {
  const got = await enrichOne('k', base({}))
  assert.equal(got.cast?.length, 6)
  assert.equal(got.cast?.[0], 'Actor 0')
})

await check('a TV row hits the /tv endpoint', async () => {
  calls.length = 0
  await enrichOne('k', base({ imdbId: 'tt0903747', isTv: true, titleType: 'TV Series' }))
  assert.ok(
    calls.some((c) => c.includes('/tv/1396')),
    calls.join('\n'),
  )
})

await check('no TMDB match still marks the row enriched', async () => {
  mode = 'nomatch'
  const got = await enrichOne('k', base({}))
  assert.equal(got.enriched, true)
  assert.equal(got.tmdbId, undefined)
})

await check('a 429 is retried after Retry-After', async () => {
  mode = 'throttle'
  throttled = false
  const got = await enrichOne('k', base({}))
  assert.equal(got.tmdbId, 27205)
})

await check('one failing title does not abort the batch', async () => {
  mode = 'ok'
  const list = [base({ imdbId: 'tt1375666' }), base({ imdbId: 'tt0000001', title: 'Boom' })]
  let n = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes('tt0000001')) throw new Error('network down')
    return realFetch(url as unknown as RequestInfo)
  }) as unknown as typeof fetch
  const out = await enrichAll('k', list, () => { n++ }, 2)
  globalThis.fetch = realFetch
  assert.equal(out.length, 2)
  assert.equal(out[0].tmdbId, 27205)
  assert.equal(out[1].enriched, true)
  assert.equal(out[1].tmdbId, undefined)
  assert.equal(n, 2, 'progress fires for failures too')
})

await check('the stop callback halts a batch', async () => {
  mode = 'ok'
  const list = Array.from({ length: 20 }, (_, i) => base({ imdbId: `tt000000${i}` }))
  const out = await enrichAll('k', list, undefined, 1, () => true)
  assert.equal(out.filter((t) => t.tmdbId).length, 0)
})

console.log('\ncinemeta (keyless provider)')

const CINE_MOVIE = {
  meta: {
    name: 'The Covenant',
    poster: 'https://images.metahub.space/poster/small/tt4873118/img',
    background: 'https://images.metahub.space/background/medium/tt4873118/img',
    logo: 'https://images.metahub.space/logo/medium/tt4873118/img',
    description: 'A description.',
    cast: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    director: ['Guy Ritchie'],
    genres: ['Action', 'War'],
    imdbRating: '7.5',
    trailers: [{ source: 'FROM_TRAILERS', type: 'Trailer' }],
    trailerStreams: [{ ytId: 'FROM_STREAMS', title: 'x' }],
  },
}

let cineKinds: string[] = []
let cineMode: 'ok' | 'seriesOnly' | 'none' = 'ok'

const cineFetch = (async (url: string) => {
  const u = String(url)
  const kind = u.includes('/series/') ? 'series' : 'movie'
  cineKinds.push(kind)
  const found = cineMode === 'ok' ? true : cineMode === 'seriesOnly' ? kind === 'series' : false
  if (!found) return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) }
  return { ok: true, status: 200, headers: new Headers(), json: async () => CINE_MOVIE }
}) as unknown as typeof fetch

await check('upgrades the small poster to medium', async () => {
  globalThis.fetch = cineFetch
  cineKinds = []
  cineMode = 'ok'
  const got = await cineOne(base({}))
  assert.equal(got.poster, 'https://images.metahub.space/poster/medium/tt4873118/img')
  assert.equal(got.backdrop, 'https://images.metahub.space/background/medium/tt4873118/img')
  assert.equal(got.logo, 'https://images.metahub.space/logo/medium/tt4873118/img')
})

await check('prefers trailerStreams over the legacy trailers array', async () => {
  const got = await cineOne(base({}))
  assert.equal(got.trailerKey, 'FROM_STREAMS')
})

await check('caps cast at 6 and keeps CSV genres/directors authoritative', async () => {
  const got = await cineOne(base({ genres: ['Thriller'], directors: ['From CSV'] }))
  assert.equal(got.cast?.length, 6)
  assert.deepEqual(got.genres, ['Thriller'])
  assert.deepEqual(got.directors, ['From CSV'])
})

await check('backfills genres/directors when the CSV had none', async () => {
  const got = await cineOne(base({ genres: [], directors: [] }))
  assert.deepEqual(got.genres, ['Action', 'War'])
  assert.deepEqual(got.directors, ['Guy Ritchie'])
})

await check('a movie row mislabelled in the CSV falls back to /series', async () => {
  cineKinds = []
  cineMode = 'seriesOnly'
  const got = await cineOne(base({ isTv: false }))
  assert.deepEqual(cineKinds, ['movie', 'series'], cineKinds.join(','))
  assert.ok(got.poster)
})

await check('a 404 from both kinds marks the row enriched with no artwork', async () => {
  cineMode = 'none'
  const got = await cineOne(base({}))
  assert.equal(got.enriched, true)
  assert.equal(got.poster, undefined)
})

await check('cinemeta batch isolates failures', async () => {
  cineMode = 'ok'
  const good = cineFetch
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes('tt0000009')) throw new Error('offline')
    return good(url as unknown as RequestInfo)
  }) as unknown as typeof fetch
  const out = await cineAll([base({}), base({ imdbId: 'tt0000009' })], undefined, 2)
  assert.ok(out[0].poster)
  assert.equal(out[1].enriched, true)
  assert.equal(out[1].poster, undefined)
})

console.log('\nwatch link')

await check('the default template matches the site it was built for', () => {
  assert.equal(
    buildSearchUrl(DEFAULT_TEMPLATE, base({ title: 'The Covenant' })),
    'https://www1.movies2watch.biz/search?keyword=The+Covenant',
  )
})

await check('spaces are + in a query string but %20 in a path', () => {
  const t = base({ title: 'The Covenant' })
  assert.equal(
    buildSearchUrl('https://example.com/search?q={title}', t),
    'https://example.com/search?q=The+Covenant',
  )
  assert.equal(
    buildSearchUrl('https://example.com/search/{title}/', t),
    'https://example.com/search/The%20Covenant/',
  )
})

await check('punctuation and accents are percent-encoded', () => {
  assert.equal(
    buildSearchUrl(DEFAULT_TEMPLATE, base({ title: 'Pride & Prejudice' })),
    'https://www1.movies2watch.biz/search?keyword=Pride+%26+Prejudice',
  )
  assert.equal(
    buildSearchUrl(DEFAULT_TEMPLATE, base({ title: 'Amélie' })),
    'https://www1.movies2watch.biz/search?keyword=Am%C3%A9lie',
  )
})

await check('a template with no placeholder gets the title appended', () => {
  assert.equal(
    buildSearchUrl('https://www1.movies2watch.biz/search?keyword=', base({ title: 'Tenet' })),
    'https://www1.movies2watch.biz/search?keyword=Tenet',
  )
})

await check('{year} and {imdb} substitute too', () => {
  const t = base({ title: 'Dune', year: 2021, imdbId: 'tt1160419' })
  assert.equal(
    buildSearchUrl('https://example.com/{imdb}?q={title}&y={year}', t),
    'https://example.com/tt1160419?q=Dune&y=2021',
  )
})

await check('a missing year leaves an empty value, not "null"', () => {
  assert.equal(
    buildSearchUrl('https://example.com/?q={title}&y={year}', base({ title: 'X', year: null })),
    'https://example.com/?q=X&y=',
  )
})

await check('an empty template falls back to the default', () => {
  assert.equal(
    buildSearchUrl('   ', base({ title: 'Tenet' })),
    'https://www1.movies2watch.biz/search?keyword=Tenet',
  )
})

await check('repeated calls are stable (no sticky regex lastIndex)', () => {
  const t = base({ title: 'Heat' })
  const a = buildSearchUrl(DEFAULT_TEMPLATE, t)
  const b = buildSearchUrl(DEFAULT_TEMPLATE, t)
  const c = buildSearchUrl(DEFAULT_TEMPLATE, t)
  assert.equal(a, b)
  assert.equal(b, c)
})

await check('javascript: and data: templates are rejected', () => {
  assert.ok(validateTemplate('javascript:alert(1)'))
  assert.ok(validateTemplate('data:text/html,<script>'))
  assert.ok(validateTemplate('not a url'))
  assert.ok(validateTemplate(''))
})

await check('every shipped preset validates and builds', () => {
  const t = base({ title: 'Pride & Prejudice', year: 2005, imdbId: 'tt0414387' })
  for (const p of PRESETS) {
    assert.equal(validateTemplate(p.template), null, `${p.label} failed validation`)
    const url = buildSearchUrl(p.template, t)
    assert.doesNotThrow(() => new URL(url), `${p.label} produced ${url}`)
  }
})

console.log('\ncsv parsing')

await check('quoted commas do not split fields', () => {
  const csv =
    'Position,Const,Created,Title,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Directors\n' +
    '1,tt0111161,2023-01-02,"The Shawshank, Redemption",Movie,9.3,142,1994,"Drama, Crime","Frank Darabont"\n'
  const [t] = titlesFromCsv(csv)
  assert.equal(t.title, 'The Shawshank, Redemption')
  assert.deepEqual(t.genres, ['Drama', 'Crime'])
  assert.equal(t.runtime, 142)
})

await check('escaped double quotes survive', () => {
  const csv = 'Const,Title,Title Type\ntt1,"He said ""hi""",Movie\n'
  assert.equal(titlesFromCsv(csv)[0].title, 'He said "hi"')
})

await check('a UTF-8 BOM does not break the Const column', () => {
  const csv = '﻿Const,Title,Title Type\ntt1,A,Movie\n'
  assert.equal(titlesFromCsv(csv).length, 1)
})

await check('CRLF line endings parse', () => {
  const csv = 'Const,Title,Title Type\r\ntt1,A,Movie\r\ntt2,B,Movie\r\n'
  assert.equal(titlesFromCsv(csv).length, 2)
})

await check('duplicate ids are dropped', () => {
  const csv = 'Const,Title,Title Type\ntt1,A,Movie\ntt1,A again,Movie\n'
  assert.equal(titlesFromCsv(csv).length, 1)
})

await check('TV Series rows are flagged isTv', () => {
  const csv = 'Const,Title,Title Type\ntt1,A,TV Series\ntt2,B,Movie\n'
  const out = titlesFromCsv(csv)
  assert.equal(out[0].isTv, true)
  assert.equal(out[1].isTv, false)
})

await check('a non-IMDb CSV is rejected with a useful message', () => {
  assert.throws(() => titlesFromCsv('name,age\nbob,3\n'), /Const/)
})

await check('column order does not matter', () => {
  const csv = 'Title Type,Title,Const\nMovie,Zed,tt9\n'
  assert.equal(titlesFromCsv(csv)[0].imdbId, 'tt9')
})

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
