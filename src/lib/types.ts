/** Canonical record for one watchlist entry, after CSV parse + optional TMDB enrichment. */
export interface Title {
  /** IMDb const, e.g. "tt0111161". Primary key. */
  imdbId: string
  title: string
  originalTitle: string
  year: number | null
  /** IMDb "Title Type" column verbatim: Movie, TV Series, TV Mini Series, Short, Video, TV Movie. */
  titleType: string
  /** true for TV Series / TV Mini Series — decides which TMDB endpoint is used. */
  isTv: boolean
  imdbRating: number | null
  runtime: number | null
  genres: string[]
  directors: string[]
  numVotes: number | null
  releaseDate: string | null
  /** IMDb watchlist ordering (Position column). */
  position: number
  /** Date the row was added to the watchlist (Created column). */
  created: string | null

  // ---- filled in by artwork enrichment; all optional so the app runs without it ----
  /**
   * Absolute image URLs. Providers disagree about whether they hand back a bare
   * path or a full URL, so both are normalised to a URL at the provider
   * boundary and nothing downstream has to know which one ran.
   */
  poster?: string | null
  backdrop?: string | null
  logo?: string | null
  overview?: string
  /** YouTube video id for the trailer, or null if none usable. */
  trailerKey?: string | null
  cast?: string[]
  tagline?: string | null
  tmdbId?: number
  tmdbRating?: number | null
  /** Set once a provider has answered, hit or miss — stops us retrying forever. */
  enriched?: boolean
}

/**
 * Per-title state the user owns, kept in its own IndexedDB store keyed by IMDb
 * id. Deliberately not part of Library: importing a new CSV replaces the
 * library wholesale, and it must never take watched flags down with it.
 */
export interface SaveData {
  watched: boolean
  favourite: boolean
  /** 0..1. Anything strictly between the ends counts as "in progress". */
  progress: number
  /** Unix ms of the last time the title was launched, 0 if never. */
  lastOpened: number
  updatedAt: number
}

export const EMPTY_SAVE: SaveData = {
  watched: false,
  favourite: false,
  progress: 0,
  lastOpened: 0,
  updatedAt: 0,
}

/** imdbId -> SaveData. Rows with nothing set are dropped rather than stored. */
export type SaveMap = Record<string, SaveData>

export interface Library {
  /** Unix ms of when this library was generated. */
  generatedAt: number
  /** How many titles carry TMDB data. */
  enrichedCount: number
  source: string
  titles: Title[]
}

/** One row in a vertical XMB column. */
export interface MenuItem {
  id: string
  label: string
  sublabel?: string
  /** Present for leaf rows that map to a watchlist title. */
  title?: Title
  /** Present for group rows (a genre, a decade, a director) that open a sub-column. */
  children?: MenuItem[]
  /** Built-in action rows (settings toggles, import). */
  action?: string
  /** Category-level icon name; leaves use artwork instead. */
  icon?: string
}

export interface Category {
  id: string
  label: string
  icon: string
  items: MenuItem[]
}
