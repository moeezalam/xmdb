import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Screen } from './components/Screen'
import { Backdrop } from './components/Backdrop'
import { Xmb, type ColumnState } from './components/Xmb'
import { InfoPanel } from './components/InfoPanel'
import { Detail } from './components/Detail'
import {
  ImportDialog,
  KeyDialog,
  ProgressDialog,
  SearchLinkDialog,
  Dialog,
} from './components/Dialog'
import { WaveCanvas } from './components/WaveCanvas'
import { attachInput, type Btn, type Dir } from './lib/input'
import { buildCategories, searchItems, subtitleFor } from './lib/menu'
import { Calibration } from './components/Calibration'
import { backdropUrl, openInNewTab, placeholderGradient } from './lib/art'
import { buildSearchUrl, PRESETS, validateTemplate } from './lib/searchLink'
import { titlesFromCsv } from './lib/csv'
import { enrichAll as enrichCinemeta } from './lib/cinemeta'
import { enrichAll as enrichTmdb, validateKey } from './lib/tmdb'
import {
  clearLibrary,
  clearSaveData,
  loadLibrary,
  loadSaveData,
  loadSettings,
  saveLibrary,
  saveSaveData,
  saveSettings,
  type Settings,
} from './lib/storage'
import { sfx, setSoundEnabled, unlockAudio } from './lib/audio'
import { SEL_Y, TEXT_X, PANEL_W, TRAILER_DWELL } from './lib/layout'
import { EMPTY_SAVE, type Library, type MenuItem, type SaveMap, type Title } from './lib/types'
import './styles/xmb.css'

/** Stand-in for the link preview when nothing is selected yet. */
const SAMPLE_TITLE: Title = {
  imdbId: 'tt4873118',
  title: 'The Covenant',
  originalTitle: 'The Covenant',
  year: 2023,
  titleType: 'Movie',
  isTv: false,
  imdbRating: 7.5,
  runtime: 123,
  genres: [],
  directors: [],
  numVotes: null,
  releaseDate: null,
  position: 1,
  created: null,
}

type DialogKind =
  | null
  | 'key'
  | 'import'
  | 'progress'
  | 'info'
  | 'reset'
  | 'link'
  | 'clear-saves'

export default function App() {
  const [lib, setLib] = useState<Library | null>(null)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [catIndex, setCatIndex] = useState(0)
  const pickedDefaultCat = useRef(false)
  const [stack, setStack] = useState<ColumnState[]>([{ items: [], index: 0 }])
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [detail, setDetail] = useState<Title | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [importError, setImportError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [saves, setSaves] = useState<SaveMap>({})
  const stopEnrich = useRef(false)
  const saveFileInput = useRef<HTMLInputElement>(null)

  // ---- boot: bundled library first, then any user import from IndexedDB ----
  useEffect(() => {
    let alive = true
    void (async () => {
      let bundled: Library | null = null
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/library.json`)
        if (res.ok) bundled = (await res.json()) as Library
      } catch {
        // No bundled library is a valid state — the user can import one.
      }
      const [stored, savedMarks] = await Promise.all([loadLibrary(), loadSaveData()])
      if (!alive) return
      setSaves(savedMarks)
      setLib(
        stored ?? bundled ?? { generatedAt: Date.now(), enrichedCount: 0, source: 'empty', titles: [] },
      )
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound])
  useEffect(() => saveSettings(settings), [settings])

  const titles = useMemo(() => lib?.titles ?? [], [lib])

  const categories = useMemo(() => {
    const cats = buildCategories(titles, saves, settings.hideWatched)
    // Settings rows carry live state in their sublabels.
    const on = (b: boolean) => (b ? 'On' : 'Off')
    for (const it of cats[0].items) {
      if (it.action === 'toggle-trailers') it.sublabel = on(settings.trailers)
      if (it.action === 'toggle-sound') it.sublabel = on(settings.sound)
      if (it.action === 'toggle-wave') it.sublabel = on(settings.wave)
      if (it.action === 'toggle-crt') it.sublabel = on(settings.crt)
      if (it.action === 'enrich')
        it.sublabel = `${lib?.enrichedCount ?? 0} of ${titles.length} have artwork`
      if (it.action === 'tmdb-key') it.sublabel = settings.tmdbKey ? 'Key set' : 'Not set'
      if (it.action === 'import') it.sublabel = lib?.source ?? '—'
      if (it.action === 'toggle-hide-watched') it.sublabel = on(settings.hideWatched)
      if (it.action === 'search-link') {
        try {
          it.sublabel = new URL(settings.searchTemplate.replace(/\{\w+\}/g, 'x')).host
        } catch {
          it.sublabel = 'Not set'
        }
      }
      if (it.action === 'export-saves') it.sublabel = `${Object.keys(saves).length} titles marked`
    }
    return cats
  }, [titles, saves, settings, lib?.source, lib?.enrichedCount])

  const isSearch = categories[catIndex]?.id === 'search'

  /** Index by id, never by position — categories shift as features are added. */
  const catIndexOf = useCallback(
    (id: string) => Math.max(0, categories.findIndex((c) => c.id === id)),
    [categories],
  )

  // Land on Movies once the library is in, but only ever on the first render
  // that has one, so this never yanks the cursor out from under the user.
  useEffect(() => {
    if (pickedDefaultCat.current || !titles.length) return
    pickedDefaultCat.current = true
    setCatIndex(catIndexOf('movies'))
  }, [titles.length, catIndexOf])

  // Column 0 follows the selected category (or the live search results).
  // `categories` is rebuilt whenever a setting changes, which must NOT throw the
  // cursor back to the top of the list — hence the identity key.
  const colKey = useRef('')
  useEffect(() => {
    const cat = categories[catIndex]
    if (!cat) return
    const items = cat.id === 'search' ? searchItems(titles, query) : cat.items
    const key = `${cat.id}|${query}|${items.length}`
    const same = key === colKey.current
    colKey.current = key
    setStack((prev) => {
      if (!same || !prev.length) return [{ items, index: 0 }]
      const copy = prev.slice()
      copy[0] = { items, index: Math.min(prev[0].index, Math.max(0, items.length - 1)) }
      return copy
    })
  }, [catIndex, categories, query, titles])

  const activeCol = stack[stack.length - 1]
  const selected: MenuItem | undefined = activeCol?.items[activeCol.index]
  const selectedTitle = selected?.title

  // ---- trailer dwell: never start mid-scroll ----
  useEffect(() => {
    setTrailerKey(null)
    if (!settings.trailers || !selectedTitle?.trailerKey) return
    const id = window.setTimeout(
      () => setTrailerKey(selectedTitle.trailerKey ?? null),
      TRAILER_DWELL,
    )
    return () => window.clearTimeout(id)
  }, [selectedTitle?.imdbId, selectedTitle?.trailerKey, settings.trailers])

  /**
   * Single write path for save data. Rows that end up back at their defaults
   * are deleted rather than stored, so the map only ever holds titles the user
   * has actually touched and "0 titles marked" stays truthful.
   */
  const mutateSave = useCallback(
    (imdbId: string, patch: (prev: typeof EMPTY_SAVE) => typeof EMPTY_SAVE) => {
      setSaves((prev) => {
        const before = prev[imdbId] ?? EMPTY_SAVE
        const after = { ...patch(before), updatedAt: Date.now() }
        const next = { ...prev }
        if (!after.watched && !after.favourite && after.progress <= 0 && !after.lastOpened) {
          delete next[imdbId]
        } else {
          next[imdbId] = after
        }
        void saveSaveData(next)
        return next
      })
    },
    [],
  )

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800)
  }, [])

  const applyTitles = useCallback(async (next: Title[], source: string) => {
    const nextLib: Library = {
      generatedAt: Date.now(),
      // "Enriched" means it has artwork, which is the whole point — a row that
      // a provider answered about but had no poster for does not count.
      enrichedCount: next.filter((t) => t.poster || t.backdrop).length,
      source,
      titles: next,
    }
    setLib(nextLib)
    await saveLibrary(nextLib)
  }, [])

  /**
   * Artwork pass. Cinemeta is the default because it needs no key; a TMDB key,
   * if one is set, then runs over whatever Cinemeta could not fill.
   */
  const runEnrich = useCallback(
    async (opts: { force?: boolean } = {}) => {
      stopEnrich.current = false
      const source = lib?.source ?? 'watchlist.csv'
      const work = opts.force ? titles.map((t) => ({ ...t, enriched: false })) : titles
      const pending = work.filter((t) => !t.enriched).length
      if (!pending) {
        showToast('Everything already has artwork. Re-run with Force to refresh.')
        return
      }

      setProgress({ done: 0, total: pending, label: '' })
      setDialog('progress')

      let next = await enrichCinemeta(
        work,
        (done, total, label) => setProgress({ done, total, label }),
        10,
        () => stopEnrich.current,
      )

      if (settings.tmdbKey && !stopEnrich.current) {
        const gaps = next.filter((t) => !t.poster && !t.backdrop)
        if (gaps.length) {
          setProgress({ done: 0, total: gaps.length, label: 'TMDB fallback…' })
          const patched = await enrichTmdb(
            settings.tmdbKey,
            gaps.map((t) => ({ ...t, enriched: false })),
            (done, total, label) => setProgress({ done, total, label }),
            8,
            () => stopEnrich.current,
          )
          const byId = new Map(patched.map((t) => [t.imdbId, t]))
          next = next.map((t) => byId.get(t.imdbId) ?? t)
        }
      }

      await applyTitles(next, source)
      setDialog(null)
      const got = next.filter((t) => t.poster || t.backdrop).length
      showToast(`Artwork: ${got} of ${next.length} titles.`)
    },
    [titles, applyTitles, lib?.source, showToast, settings.tmdbKey],
  )

  const onFile = useCallback(
    async (file: File) => {
      setImportError(null)
      try {
        const text = await file.text()
        const next = titlesFromCsv(text)
        if (!next.length) {
          setImportError('No rows with an IMDb id were found in that file.')
          return
        }
        await applyTitles(next, file.name)
        setDialog(null)
        setCatIndex(catIndexOf('movies'))
        showToast(`Imported ${next.length} titles — fetching artwork…`)
        // No key needed, so a fresh import goes straight to artwork.
        void runEnrich()
      } catch (err) {
        setImportError((err as Error).message)
      }
    },
    [applyTitles, runEnrich, showToast, catIndexOf],
  )

  const runAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'import':
          setImportError(null)
          setDialog('import')
          break
        case 'enrich':
          void runEnrich()
          break
        case 'enrich-force':
          void runEnrich({ force: true })
          break
        case 'tmdb-key':
          setDialog('key')
          break
        case 'calibrate':
          setCalibrating(true)
          break
        case 'search-link':
          setDialog('link')
          break
        case 'toggle-hide-watched':
          setSettings((s) => ({ ...s, hideWatched: !s.hideWatched }))
          break
        case 'export-saves': {
          const blob = new Blob([JSON.stringify({ version: 1, saves }, null, 2)], {
            type: 'application/json',
          })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'xmdb-save-data.json'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          showToast(`Exported ${Object.keys(saves).length} marked titles.`)
          break
        }
        case 'import-saves':
          saveFileInput.current?.click()
          break
        case 'clear-saves':
          setDialog('clear-saves')
          break
        case 'toggle-trailers':
          setSettings((s) => ({ ...s, trailers: !s.trailers }))
          break
        case 'toggle-sound':
          setSettings((s) => ({ ...s, sound: !s.sound }))
          break
        case 'toggle-wave':
          setSettings((s) => ({ ...s, wave: !s.wave }))
          break
        case 'toggle-crt':
          setSettings((s) => ({ ...s, crt: !s.crt }))
          break
        case 'info':
          setDialog('info')
          break
        case 'reset':
          setDialog('reset')
          break
      }
    },
    [runEnrich, saves, showToast],
  )

  /** Restores an exported save file, merging newest-wins over what is here. */
  const onSaveFile = useCallback(
    async (file: File) => {
      try {
        const parsed = JSON.parse(await file.text()) as { saves?: SaveMap }
        const incoming = parsed?.saves
        if (!incoming || typeof incoming !== 'object') {
          showToast('That file has no save data in it.')
          return
        }
        setSaves((prev) => {
          const next = { ...prev }
          let n = 0
          for (const [id, s] of Object.entries(incoming)) {
            if (!/^tt\d+$/.test(id) || typeof s !== 'object' || s === null) continue
            const merged = {
              watched: !!s.watched,
              favourite: !!s.favourite,
              progress: Math.max(0, Math.min(1, Number(s.progress) || 0)),
              lastOpened: Number(s.lastOpened) || 0,
              updatedAt: Number(s.updatedAt) || 0,
            }
            const cur = next[id]
            if (!cur || merged.updatedAt >= cur.updatedAt) {
              next[id] = merged
              n++
            }
          }
          void saveSaveData(next)
          showToast(`Restored ${n} marked titles.`)
          return next
        })
      } catch (err) {
        showToast(`Could not read that file: ${(err as Error).message}`)
      }
    },
    [showToast],
  )

  // ---- navigation ----
  const blocked = useCallback(() => dialog !== null || detail !== null, [dialog, detail])
  const typing = useCallback(() => isSearch, [isSearch])

  const onDir = useCallback(
    (dir: Dir) => {
      if (dialog || detail) return
      setStack((prev) => {
        const depth = prev.length - 1
        const col = prev[depth]
        if (!col) return prev

        if (dir === 'up' || dir === 'down') {
          if (!col.items.length) return prev
          const next = col.index + (dir === 'down' ? 1 : -1)
          if (next < 0 || next >= col.items.length) {
            sfx.error()
            return prev
          }
          sfx.move()
          const copy = prev.slice()
          copy[depth] = { ...col, index: next }
          return copy
        }

        if (dir === 'left') {
          if (depth > 0) {
            sfx.back()
            return prev.slice(0, -1)
          }
          setCatIndex((c) => {
            if (c <= 0) {
              sfx.error()
              return c
            }
            sfx.lateral()
            return c - 1
          })
          return prev
        }

        const item = col.items[col.index]
        if (item?.children?.length) {
          sfx.enter()
          return [...prev, { items: item.children, index: 0 }]
        }
        setCatIndex((c) => {
          if (c >= categories.length - 1) {
            sfx.error()
            return c
          }
          sfx.lateral()
          return c + 1
        })
        return prev
      })
    },
    [dialog, detail, categories.length],
  )

  const onPage = useCallback(
    (delta: number) => {
      if (dialog || detail) return
      setStack((prev) => {
        const depth = prev.length - 1
        const col = prev[depth]
        if (!col?.items.length) return prev
        const next = Math.max(0, Math.min(col.items.length - 1, col.index + delta))
        if (next === col.index) {
          sfx.error()
          return prev
        }
        sfx.lateral()
        const copy = prev.slice()
        copy[depth] = { ...col, index: next }
        return copy
      })
    },
    [dialog, detail],
  )

  const onBtn = useCallback(
    (btn: Btn) => {
      unlockAudio()
      if (btn === 'back') {
        if (detail) {
          sfx.back()
          setDetail(null)
          return
        }
        if (dialog) {
          setDialog(null)
          return
        }
        if (isSearch && query) {
          setQuery((q) => q.slice(0, -1))
          return
        }
        setStack((prev) => {
          if (prev.length > 1) {
            sfx.back()
            return prev.slice(0, -1)
          }
          return prev
        })
        return
      }
      if (btn === 'enter') {
        if (dialog || detail) return
        const item = selected
        if (!item) return
        if (item.children?.length) {
          sfx.enter()
          setStack((prev) => [...prev, { items: item.children ?? [], index: 0 }])
          return
        }
        if (item.action) {
          sfx.enter()
          runAction(item.action)
          return
        }
        if (item.title) {
          sfx.enter()
          // Opening a title launches it, the way X launches a game on the PSP,
          // and stamps it so Continue can order by most recently launched.
          const id = item.title.imdbId
          mutateSave(id, (s) => ({ ...s, lastOpened: Date.now() }))
          openInNewTab(buildSearchUrl(settings.searchTemplate, item.title))
        }
        return
      }
      if (btn === 'watched') {
        if (dialog || detail || !selected?.title) return
        const t = selected.title
        sfx.lateral()
        mutateSave(t.imdbId, (s) => ({
          ...s,
          watched: !s.watched,
          // Marking watched completes it; un-marking clears a full bar.
          progress: !s.watched ? 1 : s.progress >= 1 ? 0 : s.progress,
        }))
        return
      }
      if (btn === 'favourite') {
        if (dialog || detail || !selected?.title) return
        sfx.lateral()
        mutateSave(selected.title.imdbId, (s) => ({ ...s, favourite: !s.favourite }))
        return
      }
      if (btn === 'options') {
        // Triangle opens the info page rather than launching.
        if (dialog || detail) return
        if (selected?.title) {
          sfx.enter()
          setDetail(selected.title)
        }
        return
      }
      // Start jumps straight to Search, like XMB's shortcut buttons.
      sfx.lateral()
      setCatIndex(catIndexOf('search'))
    },
    [
      detail,
      dialog,
      isSearch,
      query,
      selected,
      runAction,
      catIndexOf,
      mutateSave,
      settings.searchTemplate,
    ],
  )

  const onProgress = useCallback(
    (delta: number) => {
      if (dialog || detail || !selected?.title) return
      const t = selected.title
      sfx.move()
      mutateSave(t.imdbId, (s) => {
        const next = Math.max(0, Math.min(1, +(s.progress + delta / 100).toFixed(2)))
        // Reaching the end is the same statement as marking it watched.
        return { ...s, progress: next, watched: next >= 1 ? true : s.watched }
      })
    },
    [dialog, detail, selected, mutateSave],
  )

  const onText = useCallback(
    (ch: string) => {
      if (isSearch) {
        setQuery((q) => (q.length < 40 ? q + ch : q))
        return
      }
      if (ch === '/') {
        setCatIndex(catIndexOf('search'))
        return
      }
      if (ch === 'c' || ch === 'C') setCalibrating((v) => !v)
    },
    [isSearch, catIndexOf],
  )

  /*
   * The listener is attached exactly once. Re-attaching on every render would
   * drop the held-key state each time the selection changed, which silently
   * killed auto-repeat: holding Down moved one row and stopped.
   */
  const handlers = useRef({ onDir, onBtn, onPage, onProgress, blocked, typing, onText })
  handlers.current = { onDir, onBtn, onPage, onProgress, blocked, typing, onText }

  useEffect(
    () =>
      attachInput({
        onDir: (d) => handlers.current.onDir(d),
        onBtn: (b) => handlers.current.onBtn(b),
        onPage: (n) => handlers.current.onPage(n),
        onProgress: (n) => handlers.current.onProgress(n),
        isBlocked: () => handlers.current.blocked(),
        isTyping: () => handlers.current.typing(),
        onText: (c) => handlers.current.onText(c),
        onBackspace: () => setQuery((q) => q.slice(0, -1)),
      }),
    [],
  )

  const onPick = useCallback(
    (ci: number, depth: number, idx: number) => {
      unlockAudio()
      if (ci !== catIndex) {
        sfx.lateral()
        setCatIndex(ci)
        return
      }
      setStack((prev) => {
        const trimmed = prev.slice(0, depth + 1)
        const col = trimmed[depth]
        if (!col) return prev
        if (col.index === idx) {
          // Clicking the already-selected row activates it, matching Enter.
          // Titles are excluded: their tile is an anchor that navigates on its
          // own, and handling it here too would open the tab twice.
          const item = col.items[idx]
          if (item?.title) {
            sfx.enter()
          } else if (item?.children?.length) {
            sfx.enter()
            return [...trimmed, { items: item.children, index: 0 }]
          } else if (item?.action) {
            sfx.enter()
            queueMicrotask(() => runAction(item.action!))
          }
          return trimmed
        }
        sfx.move()
        trimmed[depth] = { ...col, index: idx }
        return trimmed
      })
    },
    [catIndex, runAction],
  )

  const bg = selectedTitle ? backdropUrl(selectedTitle) : null
  const grad = selectedTitle
    ? placeholderGradient(selectedTitle)
    : 'linear-gradient(160deg,#101725,#05070c)'

  if (!lib) {
    return (
      <Screen crt={false}>
        <div className="boot">XMDB</div>
      </Screen>
    )
  }

  return (
    <Screen crt={settings.crt}>
      {settings.wave && <WaveCanvas />}
      <Backdrop url={bg} gradient={grad} />

      <Xmb
        categories={categories}
        catIndex={catIndex}
        stack={stack}
        trailerKey={trailerKey}
        saves={saves}
        searchTemplate={settings.searchTemplate}
        onPick={onPick}
      />

      {selected && (
        <div className="sel-label" style={{ left: TEXT_X, top: SEL_Y - 18, width: PANEL_W }}>
          <div className="sel-title">{selected.label}</div>
          {selected.title ? (
            <div className="sel-sub">
              {subtitleFor(selected.title)}
              {(() => {
                const s = saves[selected.title.imdbId]
                if (!s) return null
                const bits: string[] = []
                if (s.watched) bits.push('✓ watched')
                if (s.favourite) bits.push('★ favourite')
                if (s.progress > 0 && s.progress < 1) bits.push(`${Math.round(s.progress * 100)}%`)
                return bits.length ? <span className="marks">   {bits.join('   ')}</span> : null
              })()}
            </div>
          ) : (
            selected.sublabel && <div className="sel-sub">{selected.sublabel}</div>
          )}
        </div>
      )}

      <InfoPanel item={selected} />

      {isSearch && (
        <div className="search-bar">
          <span className="caret">/</span>
          {query ? <span>{query}</span> : <span className="dim">title, director, actor, genre</span>}
          <span className="cursor" />
          {query && <span className="count">{activeCol?.items.length ?? 0}</span>}
        </div>
      )}

      <div className="hint">
        {isSearch
          ? 'type to filter · ↑↓ select · ⏎ open · ←→ category'
          : '↑↓ select · ⏎ watch · m watched · b favourite · −/+ progress · tab info · / search'}
      </div>

      {calibrating && <Calibration onClose={() => setCalibrating(false)} />}

      {detail && (
        <Detail
          t={detail}
          save={saves[detail.imdbId]}
          searchTemplate={settings.searchTemplate}
          onToggleWatched={() =>
            mutateSave(detail.imdbId, (s) => ({
              ...s,
              watched: !s.watched,
              progress: !s.watched ? 1 : s.progress >= 1 ? 0 : s.progress,
            }))
          }
          onToggleFavourite={() =>
            mutateSave(detail.imdbId, (s) => ({ ...s, favourite: !s.favourite }))
          }
          onClose={() => setDetail(null)}
        />
      )}

      {dialog === 'key' && (
        <KeyDialog
          initial={settings.tmdbKey}
          validate={validateKey}
          onClose={() => setDialog(null)}
          onSave={(k) => {
            setSettings((s) => ({ ...s, tmdbKey: k }))
            setDialog(null)
            showToast('TMDB key saved — it will fill gaps on the next fetch.')
          }}
        />
      )}

      {dialog === 'import' && (
        <ImportDialog onFile={onFile} onClose={() => setDialog(null)} error={importError} />
      )}

      {dialog === 'link' && (
        <SearchLinkDialog
          initial={settings.searchTemplate}
          sampleTitle={selectedTitle?.title ?? 'The Covenant'}
          presets={PRESETS}
          validate={validateTemplate}
          build={(tpl) => buildSearchUrl(tpl, selectedTitle ?? SAMPLE_TITLE)}
          onClose={() => setDialog(null)}
          onSave={(tpl) => {
            setSettings((s) => ({ ...s, searchTemplate: tpl }))
            setDialog(null)
            showToast('Watch link updated.')
          }}
        />
      )}

      {dialog === 'progress' && (
        <ProgressDialog
          label={progress.label}
          done={progress.done}
          total={progress.total}
          onCancel={() => {
            stopEnrich.current = true
            setDialog(null)
          }}
        />
      )}

      {dialog === 'info' && (
        <Dialog
          title="Library"
          onClose={() => setDialog(null)}
          footer={<button onClick={() => setDialog(null)}>Close</button>}
        >
          <p>
            <b>{lib.titles.length}</b> titles from <b>{lib.source}</b>
          </p>
          <p>
            <b>{lib.enrichedCount}</b> with TMDB artwork ·{' '}
            <b>{lib.titles.filter((t) => t.trailerKey).length}</b> with trailers
          </p>
          <p className="dim">Generated {new Date(lib.generatedAt).toLocaleString()}</p>
        </Dialog>
      )}

      {dialog === 'clear-saves' && (
        <Dialog
          title="Clear Save Data"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button
                onClick={() => {
                  setSaves({})
                  void clearSaveData()
                  setDialog(null)
                  showToast('Save data cleared.')
                }}
              >
                Clear
              </button>
              <button onClick={() => setDialog(null)}>Cancel</button>
            </>
          }
        >
          <p>
            Deletes watched marks, favourites and progress for{' '}
            <b>{Object.keys(saves).length}</b> titles. Your watchlist and artwork are untouched.
          </p>
          <p className="dim">Export first if you might want it back — this cannot be undone.</p>
        </Dialog>
      )}

      {/* Hidden picker driven by Settings ▸ Import Save Data. */}
      <input
        ref={saveFileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onSaveFile(f)
          e.target.value = ''
        }}
      />

      {dialog === 'reset' && (
        <Dialog
          title="Reset Library"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button
                onClick={() => {
                  void clearLibrary().then(() => location.reload())
                }}
              >
                Reset
              </button>
              <button onClick={() => setDialog(null)}>Cancel</button>
            </>
          }
        >
          <p>Discards the imported watchlist and all fetched TMDB data, returning to the bundled library.</p>
          <p className="dim">Your TMDB key is kept.</p>
        </Dialog>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Screen>
  )
}
