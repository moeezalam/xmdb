/**
 * Builds the demo library that ships in the public repo.
 *
 *   node scripts/make-demo.ts
 *
 * Reads the full library (public/data/library.local.json, which is gitignored)
 * and writes a small, deliberately varied subset to public/data/library.json.
 *
 * The point is to show what the app does without publishing a personal
 * watchlist, so the selection is spread across decades, genres and directors —
 * a demo where every title is from one year and one genre would leave the
 * Decades, Genres and Directors columns looking broken.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Library, Title } from '../src/lib/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../public/data/library.local.json')
const out = resolve(here, '../public/data/library.json')

const full = JSON.parse(readFileSync(src, 'utf8')) as Library
const withArt = full.titles.filter((t) => t.poster && t.backdrop)

const MOVIE_TARGET = 24
const TV_TARGET = 8

/** Most-voted first — the demo should be titles a stranger recognises. */
const byVotes = (a: Title, b: Title) => (b.numVotes ?? 0) - (a.numVotes ?? 0)
const decade = (t: Title) => (t.year ? Math.floor(t.year / 10) * 10 : 0)

/**
 * Greedy spread: walk the most-voted titles and take one per decade, then one
 * per genre, then fill by popularity. Caps repeats so no single decade,
 * director or genre dominates.
 */
function pick(pool: Title[], target: number): Title[] {
  const sorted = pool.slice().sort(byVotes)
  const chosen: Title[] = []
  const seen = new Set<string>()
  const decadeCount = new Map<number, number>()
  const genreCount = new Map<string, number>()
  const directorCount = new Map<string, number>()

  const take = (t: Title) => {
    chosen.push(t)
    seen.add(t.imdbId)
    decadeCount.set(decade(t), (decadeCount.get(decade(t)) ?? 0) + 1)
    for (const g of t.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
    for (const d of t.directors) directorCount.set(d, (directorCount.get(d) ?? 0) + 1)
  }

  // Pass 1: the most-voted title from each decade.
  for (const t of sorted) {
    if (chosen.length >= target) break
    if (seen.has(t.imdbId)) continue
    if (!decadeCount.has(decade(t))) take(t)
  }

  // Pass 2: the most-voted title carrying a genre nothing has covered yet.
  for (const t of sorted) {
    if (chosen.length >= target) break
    if (seen.has(t.imdbId)) continue
    if (t.genres.some((g) => !genreCount.has(g))) take(t)
  }

  // Pass 3: fill by popularity, refusing anything that would make one decade
  // or one director more than a quarter of the set.
  const cap = Math.max(2, Math.ceil(target / 4))
  for (const t of sorted) {
    if (chosen.length >= target) break
    if (seen.has(t.imdbId)) continue
    if ((decadeCount.get(decade(t)) ?? 0) >= cap) continue
    if (t.directors.some((d) => (directorCount.get(d) ?? 0) >= 2)) continue
    take(t)
  }

  return chosen
}

const movies = pick(
  withArt.filter((t) => !t.isTv && t.titleType !== 'Video' && t.titleType !== 'Short'),
  MOVIE_TARGET,
)
const tv = pick(
  withArt.filter((t) => t.isTv),
  TV_TARGET,
)

// Renumber so Position is 1..n and the watchlist order carries no information
// about the original list.
const titles = [...movies, ...tv]
  .sort(byVotes)
  .map((t, i) => ({ ...t, position: i + 1, created: null, numVotes: t.numVotes }))

const demo: Library = {
  generatedAt: Date.now(),
  enrichedCount: titles.filter((t) => t.poster || t.backdrop).length,
  source: 'demo.csv',
  titles,
}

writeFileSync(out, JSON.stringify(demo))

const decades = [...new Set(titles.map((t) => `${decade(t)}s`))].sort()
const genres = [...new Set(titles.flatMap((t) => t.genres))].sort()
console.log(`wrote ${out}`)
console.log(`  ${titles.length} titles — ${movies.length} film, ${tv.length} tv`)
console.log(`  ${decades.length} decades: ${decades.join(', ')}`)
console.log(`  ${genres.length} genres: ${genres.join(', ')}`)
console.log(`  ${new Set(titles.flatMap((t) => t.directors)).size} directors`)
console.log(`  ${titles.filter((t) => t.trailerKey).length} with trailers`)
