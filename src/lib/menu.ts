import { EMPTY_SAVE, type Category, type MenuItem, type SaveMap, type Title } from './types'

export const subtitleFor = (t: Title): string => {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`.replace(/^0h /, ''))
  if (t.imdbRating) bits.push(`★ ${t.imdbRating.toFixed(1)}`)
  return bits.join('   ')
}

const leaf = (t: Title): MenuItem => ({
  id: t.imdbId,
  label: t.title,
  sublabel: subtitleFor(t),
  title: t,
})

/** Groups titles by a multi-valued key (genres, directors) into sub-columns. */
function groupBy(
  titles: Title[],
  keyOf: (t: Title) => string[],
  icon: string,
  sortBySize: boolean,
): MenuItem[] {
  const map = new Map<string, Title[]>()
  for (const t of titles) {
    for (const k of keyOf(t)) {
      if (!k) continue
      const arr = map.get(k)
      if (arr) arr.push(t)
      else map.set(k, [t])
    }
  }
  const entries = [...map.entries()]
  entries.sort((a, b) =>
    sortBySize ? b[1].length - a[1].length || a[0].localeCompare(b[0]) : a[0].localeCompare(b[0]),
  )
  return entries.map(([k, list]) => ({
    id: `grp:${icon}:${k}`,
    label: k,
    sublabel: `${list.length} title${list.length === 1 ? '' : 's'}`,
    icon,
    children: list.map(leaf),
  }))
}

const byPosition = (a: Title, b: Title) => a.position - b.position
const byRating = (a: Title, b: Title) => (b.imdbRating ?? 0) - (a.imdbRating ?? 0)

export function buildCategories(
  allTitles: Title[],
  saves: SaveMap = {},
  hideWatched = false,
): Category[] {
  const save = (t: Title) => saves[t.imdbId] ?? EMPTY_SAVE

  // The save-data categories always show everything; only the browsing
  // categories honour "hide watched", or Watched would hide itself.
  const titles = hideWatched ? allTitles.filter((t) => !save(t).watched) : allTitles

  const movies = titles.filter((t) => !t.isTv && t.titleType !== 'Video' && t.titleType !== 'Short')
  const tv = titles.filter((t) => t.isTv)
  const other = titles.filter(
    (t) => !t.isTv && (t.titleType === 'Video' || t.titleType === 'Short'),
  )

  const continueWatching = allTitles
    .filter((t) => {
      const s = save(t)
      return s.lastOpened > 0 || (s.progress > 0 && s.progress < 1)
    })
    .sort((a, b) => {
      const sa = save(a)
      const sb = save(b)
      // In-progress first, then most recently launched.
      const pa = sa.progress > 0 && sa.progress < 1 ? 0 : 1
      const pb = sb.progress > 0 && sb.progress < 1 ? 0 : 1
      return pa - pb || sb.lastOpened - sa.lastOpened
    })

  const favourites = allTitles.filter((t) => save(t).favourite).sort(byPosition)
  const watched = allTitles
    .filter((t) => save(t).watched)
    .sort((a, b) => save(b).updatedAt - save(a).updatedAt)

  const recent = titles
    .slice()
    .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '') || a.position - b.position)
    .slice(0, 60)

  const decadeOf = (t: Title) => (t.year ? [`${Math.floor(t.year / 10) * 10}s`] : [])

  const cats: Category[] = [
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      items: [
        { id: 'act:import', label: 'Import Watchlist CSV', sublabel: 'Replace the current library', icon: 'import', action: 'import' },
        { id: 'act:enrich', label: 'Fetch Artwork & Trailers', sublabel: 'No key needed', icon: 'download', action: 'enrich' },
        { id: 'act:enrich2', label: 'Re-fetch Everything', sublabel: 'Refresh all artwork', icon: 'reset', action: 'enrich-force' },
        { id: 'act:key', label: 'TMDB Key (optional)', sublabel: 'Fallback for missing artwork', icon: 'download', action: 'tmdb-key' },
        { id: 'act:link', label: 'Watch Link', sublabel: 'Where ⏎ sends you', icon: 'search', action: 'search-link' },
        { id: 'act:hidewatched', label: 'Hide Watched Titles', icon: 'check', action: 'toggle-hide-watched' },
        { id: 'act:calib', label: 'Calibration Overlay', sublabel: 'Compare against a PSP capture', icon: 'display', action: 'calibrate' },
        { id: 'act:trailers', label: 'Trailer Playback', icon: 'video', action: 'toggle-trailers' },
        { id: 'act:sound', label: 'System Sounds', icon: 'music', action: 'toggle-sound' },
        { id: 'act:wave', label: 'Wave Background', icon: 'wave', action: 'toggle-wave' },
        { id: 'act:crt', label: 'CRT / Scanline Filter', icon: 'display', action: 'toggle-crt' },
        { id: 'act:info', label: 'Library Information', icon: 'info', action: 'info' },
        { id: 'act:export', label: 'Export Save Data', sublabel: 'Watched, favourites, progress', icon: 'download', action: 'export-saves' },
        { id: 'act:importsaves', label: 'Import Save Data', sublabel: 'Restore from a backup', icon: 'import', action: 'import-saves' },
        { id: 'act:reset', label: 'Reset to Bundled Library', icon: 'reset', action: 'reset' },
        { id: 'act:clearsaves', label: 'Clear Save Data', sublabel: 'Cannot be undone', icon: 'reset', action: 'clear-saves' },
      ],
    },
    { id: 'search', label: 'Search', icon: 'search', items: [] },
    {
      id: 'continue',
      label: 'Continue',
      icon: 'play',
      items: continueWatching.map(leaf),
    },
    {
      id: 'favourites',
      label: 'Favourites',
      icon: 'heart',
      items: favourites.map(leaf),
    },
    {
      id: 'watched',
      label: 'Watched',
      icon: 'check',
      items: watched.map(leaf),
    },
    {
      id: 'recent',
      label: 'Recently Added',
      icon: 'clock',
      items: recent.map(leaf),
    },
    {
      id: 'movies',
      label: 'Movies',
      icon: 'film',
      items: movies.slice().sort(byPosition).map(leaf),
    },
    {
      id: 'tv',
      label: 'TV',
      icon: 'tv',
      items: tv.slice().sort(byPosition).map(leaf),
    },
    {
      id: 'top',
      label: 'Top Rated',
      icon: 'star',
      items: titles.slice().sort(byRating).slice(0, 60).map(leaf),
    },
    {
      id: 'genres',
      label: 'Genres',
      icon: 'tag',
      items: groupBy(titles, (t) => t.genres, 'tag', true),
    },
    {
      id: 'decades',
      label: 'Decades',
      icon: 'calendar',
      items: groupBy(titles, decadeOf, 'calendar', false).reverse(),
    },
    {
      id: 'directors',
      label: 'Directors',
      icon: 'person',
      items: groupBy(titles, (t) => t.directors, 'person', true),
    },
  ]

  if (other.length) {
    cats.push({
      id: 'other',
      label: 'Shorts & Video',
      icon: 'film',
      items: other.slice().sort(byPosition).map(leaf),
    })
  }
  return cats
}

/** Case- and diacritic-insensitive substring match across title, director and cast. */
export function searchItems(titles: Title[], query: string): MenuItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  // Strip combining diacritics so "Amelie" finds "Amélie".
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const nq = norm(q)
  return titles
    .filter((t) => {
      if (norm(t.title).includes(nq) || norm(t.originalTitle).includes(nq)) return true
      if (t.directors.some((d) => norm(d).includes(nq))) return true
      if (t.cast?.some((c) => norm(c).includes(nq))) return true
      return t.genres.some((g) => norm(g).includes(nq))
    })
    .sort((a, b) => {
      // Prefix matches on the title outrank everything else.
      const ap = norm(a.title).startsWith(nq) ? 0 : 1
      const bp = norm(b.title).startsWith(nq) ? 0 : 1
      return ap - bp || a.position - b.position
    })
    .slice(0, 80)
    .map(leaf)
}
