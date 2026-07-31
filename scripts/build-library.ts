/**
 * Turns an IMDb CSV export into public/data/library.json, the library the app
 * boots with. Optionally enriches it with TMDB artwork and trailers.
 *
 *   node scripts/build-library.ts "path/to/Watchlist.csv"
 *   TMDB_API_KEY=xxxx node scripts/build-library.ts "path/to/Watchlist.csv"
 *
 * Run under Node 22.18+ / 24, which strips the TypeScript types natively so
 * the CSV and TMDB code stays a single source of truth with the browser build.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { titlesFromCsv } from '../src/lib/csv.ts'
import { enrichAll as enrichCinemeta } from '../src/lib/cinemeta.ts'
import { enrichAll as enrichTmdb } from '../src/lib/tmdb.ts'
import type { Library } from '../src/lib/types.ts'

const here = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
/**
 * --local writes library.local.json, which the app prefers at boot and which is
 * gitignored. That is how a personal watchlist stays off the public site while
 * library.json keeps holding the demo set.
 */
const local = args.includes('--local')
const csvPath = args.find((a) => !a.startsWith('--'))

if (!csvPath) {
  console.error('usage: node scripts/build-library.ts <watchlist.csv> [--local]')
  process.exit(1)
}

const out = resolve(here, `../public/data/library${local ? '.local' : ''}.json`)

const csv = readFileSync(csvPath, 'utf8')
let titles = titlesFromCsv(csv)
console.log(`parsed ${titles.length} titles from ${csvPath}`)

const ticker = (label: string) => {
  let last = 0
  return (done: number, total: number) => {
    if (done === total || done - last >= 50) {
      last = done
      console.log(`  ${label} ${done}/${total}`)
    }
  }
}

// Cinemeta needs no key, so artwork is always fetched.
console.log('fetching artwork from Cinemeta…')
titles = await enrichCinemeta(titles, ticker('cinemeta'))

const gaps = titles.filter((t) => !t.poster && !t.backdrop)
const key = process.env.TMDB_API_KEY
if (gaps.length && key) {
  console.log(`TMDB fallback for ${gaps.length} titles without artwork…`)
  const patched = await enrichTmdb(
    key,
    gaps.map((t) => ({ ...t, enriched: false })),
    ticker('tmdb'),
  )
  const byId = new Map(patched.map((t) => [t.imdbId, t]))
  titles = titles.map((t) => byId.get(t.imdbId) ?? t)
} else if (gaps.length) {
  console.log(`${gaps.length} titles have no artwork; set TMDB_API_KEY to try a fallback`)
}

const lib: Library = {
  generatedAt: Date.now(),
  enrichedCount: titles.filter((t) => t.poster || t.backdrop).length,
  source: csvPath.split(/[\\/]/).pop() ?? 'watchlist.csv',
  titles,
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(lib))
console.log(`wrote ${out} — ${lib.titles.length} titles, ${lib.enrichedCount} enriched`)
