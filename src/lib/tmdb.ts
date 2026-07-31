import type { Title } from './types'

const BASE = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p'

/** Sizes chosen for a 480x272 logical canvas — nothing here needs `original`. */
export const imgUrl = (path: string | null | undefined, size: string): string | null =>
  path ? `${IMG}/${size}${path}` : null

/**
 * TMDB accepts either a v3 API key (query param) or a v4 read access token
 * (JWT, Authorization header). Detect by shape so the user can paste either.
 */
function authFor(key: string): { headers: Record<string, string>; qs: string } {
  const k = key.trim()
  if (k.startsWith('eyJ')) return { headers: { Authorization: `Bearer ${k}` }, qs: '' }
  return { headers: {}, qs: `api_key=${encodeURIComponent(k)}` }
}

async function get(key: string, path: string, params: Record<string, string> = {}) {
  const { headers, qs } = authFor(key)
  const search = new URLSearchParams(params).toString()
  const url = `${BASE}${path}?${[qs, search].filter(Boolean).join('&')}`

  const res = await fetch(url, { headers })
  if (res.status === 429) {
    // TMDB signals throttling with Retry-After. Honour it rather than hammering.
    const wait = Number(res.headers.get('retry-after') ?? '2') * 1000
    await new Promise((r) => setTimeout(r, wait + 250))
    return get(key, path, params)
  }
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`)
  return res.json()
}

/** Verifies a key without burning quota on the real endpoints. */
export async function validateKey(key: string): Promise<boolean> {
  try {
    await get(key, '/configuration')
    return true
  } catch {
    return false
  }
}

type Vid = { site: string; type: string; key: string; official?: boolean; size?: number }

function pickTrailer(videos: Vid[] | undefined): string | null {
  if (!videos?.length) return null
  const yt = videos.filter((v) => v.site === 'YouTube')
  const rank = (v: Vid) =>
    (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : v.type === 'Clip' ? 2 : 3) +
    (v.official ? 0 : 0.5)
  yt.sort((a, b) => rank(a) - rank(b))
  return yt[0]?.key ?? null
}

type Img = { file_path: string; iso_639_1: string | null; vote_average?: number }

function pickLogo(logos: Img[] | undefined): string | null {
  if (!logos?.length) return null
  const en = logos.filter((l) => l.iso_639_1 === 'en')
  const pool = en.length ? en : logos
  // Prefer PNG — SVG logos render inconsistently when scaled inside the canvas.
  const png = pool.filter((l) => l.file_path.endsWith('.png'))
  return (png[0] ?? pool[0]).file_path
}

/**
 * Resolves one IMDb id to full TMDB metadata.
 * Returns a partial Title; caller merges it over the CSV-derived record so
 * IMDb's own rating/runtime stay authoritative.
 */
export async function enrichOne(key: string, t: Title): Promise<Partial<Title>> {
  const found = await get(key, `/find/${t.imdbId}`, { external_source: 'imdb_id' })
  const hit = t.isTv
    ? (found.tv_results?.[0] ?? found.movie_results?.[0])
    : (found.movie_results?.[0] ?? found.tv_results?.[0])

  if (!hit) return { enriched: true }

  const isTv = !!found.tv_results?.length && !found.movie_results?.length ? true : t.isTv
  const kind = isTv && found.tv_results?.[0]?.id === hit.id ? 'tv' : 'movie'

  const d = await get(key, `/${kind}/${hit.id}`, {
    append_to_response: 'videos,images,credits',
    include_image_language: 'en,null',
  })

  return {
    tmdbId: hit.id,
    overview: d.overview || undefined,
    poster: imgUrl(d.poster_path, 'w500'),
    backdrop: imgUrl(d.backdrop_path, 'w780'),
    logo: imgUrl(pickLogo(d.images?.logos), 'w300'),
    trailerKey: pickTrailer(d.videos?.results),
    cast: (d.credits?.cast ?? []).slice(0, 6).map((c: { name: string }) => c.name),
    tmdbRating: typeof d.vote_average === 'number' ? d.vote_average : null,
    tagline: d.tagline || null,
    enriched: true,
  }
}

/**
 * Enriches a whole list with bounded concurrency.
 * TMDB's published limit has moved around; 8 in flight is well under any of them
 * and keeps a 700-title run at a few minutes rather than hitting 429s.
 */
export async function enrichAll(
  key: string,
  titles: Title[],
  onProgress?: (done: number, total: number, current: string) => void,
  concurrency = 8,
  stopped?: () => boolean,
): Promise<Title[]> {
  const out = titles.slice()
  const pending = out.map((_, i) => i).filter((i) => !out[i].enriched)
  const total = pending.length
  let done = 0
  let cursor = 0

  async function worker() {
    for (;;) {
      const slot = cursor++
      if (slot >= pending.length || stopped?.()) return
      const idx = pending[slot]
      try {
        Object.assign(out[idx], await enrichOne(key, out[idx]))
      } catch (err) {
        // A single bad title must not abort a 700-title run. Mark and move on.
        out[idx].enriched = true
        console.warn(`enrich failed for ${out[idx].imdbId}:`, (err as Error).message)
      }
      done++
      onProgress?.(done, total, out[idx].title)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
  return out
}
