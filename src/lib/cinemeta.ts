import type { Title } from './types'

/**
 * Cinemeta — Stremio's public metadata addon.
 *
 * Chosen as the default provider because it needs no API key, is keyed
 * directly by IMDb id (so no /find round trip), sends permissive CORS headers,
 * and returns poster, background, logo, cast, director and YouTube trailer ids
 * in a single request. TMDB is kept as an optional second pass for whatever
 * this misses.
 */
const BASE = 'https://v3-cinemeta.strem.io/meta'

interface CinemetaMeta {
  name?: string
  poster?: string
  background?: string
  logo?: string
  description?: string
  cast?: string[]
  director?: string[]
  genres?: string[]
  imdbRating?: string
  trailers?: { source: string; type: string }[]
  trailerStreams?: { ytId: string; title?: string }[]
}

/**
 * Poster art is served small by default; metahub also has `medium`, which is
 * 500x750 and the right size for the detail page without being wasteful.
 */
const upgradePoster = (url: string | undefined): string | null =>
  url ? url.replace('/poster/small/', '/poster/medium/') : null

function pickTrailer(m: CinemetaMeta): string | null {
  if (m.trailerStreams?.length) return m.trailerStreams[0].ytId ?? null
  const t = m.trailers?.find((x) => x.type === 'Trailer') ?? m.trailers?.[0]
  return t?.source ?? null
}

async function getMeta(kind: 'movie' | 'series', imdbId: string): Promise<CinemetaMeta | null> {
  const res = await fetch(`${BASE}/${kind}/${imdbId}.json`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Cinemeta ${res.status} for ${imdbId}`)
  const body = (await res.json()) as { meta?: CinemetaMeta }
  return body.meta ?? null
}

/**
 * Resolves one title. The IMDb "Title Type" column is not always right about
 * what Cinemeta calls it (miniseries, TV movies), so the other kind is tried
 * before giving up.
 */
export async function enrichOne(t: Title): Promise<Partial<Title>> {
  const first = t.isTv ? 'series' : 'movie'
  const second = t.isTv ? 'movie' : 'series'

  let meta = await getMeta(first, t.imdbId)
  if (!meta) meta = await getMeta(second, t.imdbId)
  if (!meta) return { enriched: true }

  const rating = meta.imdbRating ? Number(meta.imdbRating) : null

  return {
    poster: upgradePoster(meta.poster),
    backdrop: meta.background ?? null,
    logo: meta.logo ?? null,
    overview: meta.description || undefined,
    cast: meta.cast?.slice(0, 6),
    trailerKey: pickTrailer(meta),
    // Only fill gaps — the CSV's own IMDb figures stay authoritative.
    imdbRating: t.imdbRating ?? (Number.isFinite(rating) ? rating : null),
    genres: t.genres.length ? t.genres : (meta.genres ?? []),
    directors: t.directors.length ? t.directors : (meta.director ?? []),
    enriched: true,
  }
}

/**
 * Enriches a list with bounded concurrency. A single failure marks that title
 * done and moves on: one dead id must not cost a 700-title run.
 */
export async function enrichAll(
  titles: Title[],
  onProgress?: (done: number, total: number, current: string) => void,
  concurrency = 10,
  stopped?: () => boolean,
): Promise<Title[]> {
  const out = titles.slice()
  const pending = out.map((_, i) => i).filter((i) => !out[i].enriched)
  let done = 0
  let cursor = 0

  async function worker() {
    for (;;) {
      const slot = cursor++
      if (slot >= pending.length || stopped?.()) return
      const idx = pending[slot]
      try {
        Object.assign(out[idx], await enrichOne(out[idx]))
      } catch (err) {
        out[idx].enriched = true
        console.warn(`cinemeta failed for ${out[idx].imdbId}:`, (err as Error).message)
      }
      done++
      onProgress?.(done, pending.length, out[idx].title)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
  return out
}
