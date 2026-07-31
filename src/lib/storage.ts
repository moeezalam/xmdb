import type { Library, SaveMap } from './types'

const DB_NAME = 'xmdb'
const STORE = 'kv'
const LIB_KEY = 'library'
const SAVE_KEY = 'savedata'

/**
 * IndexedDB rather than localStorage: an enriched 700-title library with
 * overviews and cast lists runs past 1 MB, which is uncomfortably close to the
 * 5 MB localStorage ceiling once the browser counts UTF-16.
 */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDel(key: string): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadLibrary(): Promise<Library | undefined> {
  try {
    // indexedDB.open() can hang indefinitely rather than reject — a blocked
    // upgrade, private-browsing storage, or a profile-less browser. Boot must
    // not depend on it, so lose the race after 1.5s and use the bundled library.
    return await Promise.race([
      idbGet<Library>(LIB_KEY),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500)),
    ])
  } catch (err) {
    console.warn('IndexedDB read failed, running from the bundled library:', err)
    return undefined
  }
}

export async function saveLibrary(lib: Library): Promise<void> {
  try {
    await idbSet(LIB_KEY, lib)
  } catch (err) {
    // Non-fatal: the session still works, it just will not survive a reload.
    console.warn('IndexedDB write failed, library will not persist:', err)
  }
}

export async function clearLibrary(): Promise<void> {
  try {
    await idbDel(LIB_KEY)
  } catch (err) {
    console.warn('IndexedDB delete failed:', err)
  }
}

// ---- save data: watched / favourite / progress, keyed by IMDb id ----

/**
 * Stored under its own key so that replacing the library — a new CSV import,
 * a reset — cannot take the user's own marks with it. Nothing here is
 * derivable from the watchlist, so losing it would be the one unrecoverable
 * failure in the app.
 */
export async function loadSaveData(): Promise<SaveMap> {
  try {
    const got = await Promise.race([
      idbGet<SaveMap>(SAVE_KEY),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500)),
    ])
    return got ?? {}
  } catch (err) {
    console.warn('Could not read save data:', err)
    return {}
  }
}

export async function saveSaveData(map: SaveMap): Promise<void> {
  try {
    await idbSet(SAVE_KEY, map)
  } catch (err) {
    console.warn('Could not persist save data:', err)
  }
}

export async function clearSaveData(): Promise<void> {
  try {
    await idbDel(SAVE_KEY)
  } catch (err) {
    console.warn('Could not clear save data:', err)
  }
}

// ---- settings: small enough for localStorage, and wanted synchronously at boot ----

export interface Settings {
  tmdbKey: string
  trailers: boolean
  sound: boolean
  wave: boolean
  crt: boolean
  /** Search-link template; `{title}` is substituted. See lib/searchLink.ts. */
  searchTemplate: string
  /** Hide titles already marked watched from the browsing categories. */
  hideWatched: boolean
}

const DEFAULTS: Settings = {
  tmdbKey: '',
  trailers: true,
  sound: true,
  wave: true,
  crt: false,
  searchTemplate: 'https://www1.movies2watch.biz/search?keyword={title}',
  hideWatched: false,
}
const SETTINGS_KEY = 'xmdb:settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch (err) {
    console.warn('Could not persist settings:', err)
  }
}
