import type { Title } from './types'

/**
 * User-configurable "watch" link.
 *
 * A template is any URL containing placeholders:
 *   {title}  the title text
 *   {year}   release year, or empty
 *   {imdb}   the IMDb const, e.g. tt0111161
 *
 * A template with no placeholder is treated as a prefix and the title is
 * appended, so pasting the bare search URL out of the address bar works:
 *   https://example.com/search?keyword=      ->  ...keyword=The+Covenant
 */
export const DEFAULT_TEMPLATE = 'https://www1.movies2watch.biz/search?keyword={title}'

export interface Preset {
  label: string
  template: string
}

/** Offered in the settings dialog; the user can type anything else. */
export const PRESETS: Preset[] = [
  { label: 'movies2watch', template: 'https://www1.movies2watch.biz/search?keyword={title}' },
  { label: 'IMDb', template: 'https://www.imdb.com/title/{imdb}/' },
  { label: 'TMDB', template: 'https://www.themoviedb.org/search?query={title}' },
  { label: 'Letterboxd', template: 'https://letterboxd.com/search/{title}/' },
  { label: 'JustWatch', template: 'https://www.justwatch.com/us/search?q={title}' },
  { label: 'YouTube', template: 'https://www.youtube.com/results?search_query={title}+trailer' },
  { label: 'Google', template: 'https://www.google.com/search?q={title}+{year}+watch' },
]

const PLACEHOLDER = /\{(title|year|imdb)\}/g

/**
 * Spaces are `+` inside a query string and `%20` in a path segment. Picking
 * per placeholder position rather than globally means both
 * `?q={title}` and `/search/{title}/` produce a URL the target site accepts.
 */
function encodePart(value: string, inQuery: boolean): string {
  const encoded = encodeURIComponent(value)
  return inQuery ? encoded.replace(/%20/g, '+') : encoded
}

export function buildSearchUrl(template: string, t: Title): string {
  const raw = template.trim() || DEFAULT_TEMPLATE
  const withPlaceholder = PLACEHOLDER.test(raw) ? raw : `${raw}{title}`
  PLACEHOLDER.lastIndex = 0

  const queryStart = withPlaceholder.indexOf('?')

  return withPlaceholder.replace(PLACEHOLDER, (_match, key: string, offset: number) => {
    const inQuery = queryStart !== -1 && offset > queryStart
    const value =
      key === 'title' ? t.title : key === 'year' ? (t.year ? String(t.year) : '') : t.imdbId
    return encodePart(value, inQuery)
  })
}

/**
 * Validates a template before it is saved. Rejects anything that is not an
 * http(s) URL — a `javascript:` template would turn a stored setting into
 * script that runs on every launch.
 */
export function validateTemplate(template: string): string | null {
  const raw = template.trim()
  if (!raw) return 'Enter a URL.'
  const probe = raw.replace(PLACEHOLDER, 'x')
  let url: URL
  try {
    url = new URL(probe)
  } catch {
    return 'That is not a valid URL. Include https://'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Only http and https links are allowed.'
  }
  return null
}
