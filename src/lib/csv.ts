import type { Title } from './types'

/**
 * RFC4180 parser. IMDb exports quote any field containing a comma
 * (titles, genre lists, director lists), so a naive split() corrupts rows.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  // Strip UTF-8 BOM — IMDb exports carry one and it poisons the first header cell.
  if (text.charCodeAt(0) === 0xfeff) i = 1

  for (; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // swallow; the \n that follows terminates the row
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const num = (s: string | undefined): number | null => {
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const list = (s: string | undefined): string[] =>
  s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []

const TV_TYPES = new Set(['tv series', 'tv mini series', 'tv miniseries', 'tv special'])

/**
 * Maps an IMDb watchlist/list CSV export to Title records.
 * Columns are resolved by header name, not index, because IMDb has shipped
 * several column orders over the years (watchlist vs. ratings vs. custom list).
 */
export function titlesFromCsv(text: string): Title[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i !== -1) return i
    }
    return -1
  }

  const iConst = col('const', 'imdb id', 'tconst')
  if (iConst === -1) {
    throw new Error(
      `Not an IMDb export: no "Const" column. Found: ${rows[0].join(', ').slice(0, 200)}`,
    )
  }
  const iPos = col('position')
  const iCreated = col('created', 'date added')
  const iTitle = col('title', 'primary title')
  const iOrig = col('original title')
  const iType = col('title type')
  const iRating = col('imdb rating')
  const iRuntime = col('runtime (mins)', 'runtime')
  const iYear = col('year', 'start year')
  const iGenres = col('genres')
  const iVotes = col('num votes')
  const iRelease = col('release date')
  const iDirectors = col('directors', 'director')

  const seen = new Set<string>()
  const out: Title[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const imdbId = (row[iConst] ?? '').trim()
    if (!/^tt\d+$/.test(imdbId) || seen.has(imdbId)) continue
    seen.add(imdbId)

    const titleType = (row[iType] ?? 'Movie').trim()
    const title = (row[iTitle] ?? '').trim() || imdbId

    out.push({
      imdbId,
      title,
      originalTitle: (row[iOrig] ?? '').trim() || title,
      year: num(row[iYear]),
      titleType,
      isTv: TV_TYPES.has(titleType.toLowerCase()),
      imdbRating: num(row[iRating]),
      runtime: num(row[iRuntime]),
      genres: list(row[iGenres]),
      directors: list(row[iDirectors]),
      numVotes: num(row[iVotes]),
      releaseDate: (row[iRelease] ?? '').trim() || null,
      position: num(row[iPos]) ?? r,
      created: (row[iCreated] ?? '').trim() || null,
    })
  }
  return out
}
