import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Dialog({
  title,
  children,
  footer,
  onClose,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose(): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input,button')?.focus()
  }, [])
  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div className="dialog" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  )
}

export function KeyDialog({
  initial,
  onSave,
  onClose,
  validate,
}: {
  initial: string
  onSave(key: string): void
  onClose(): void
  validate(key: string): Promise<boolean>
}) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<'idle' | 'checking' | 'bad'>('idle')

  const submit = async () => {
    const k = value.trim()
    if (!k) return
    setState('checking')
    const ok = await validate(k)
    if (!ok) {
      setState('bad')
      return
    }
    onSave(k)
  }

  return (
    <Dialog
      title="TMDB API Key"
      onClose={onClose}
      footer={
        <>
          <button onClick={submit} disabled={state === 'checking'}>
            {state === 'checking' ? 'Checking…' : 'Save & Fetch'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p>
        Paste a TMDB v3 API key or v4 read access token. Free at
        <span className="mono-url"> themoviedb.org/settings/api</span>. Stored in this browser only.
      </p>
      <input
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="v3 key, or eyJ… token"
        onChange={(e) => {
          setValue(e.target.value)
          setState('idle')
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') onClose()
        }}
      />
      {state === 'bad' && <p className="err">TMDB rejected that key.</p>}
    </Dialog>
  )
}

export function ImportDialog({
  onFile,
  onClose,
  error,
}: {
  onFile(file: File): void
  onClose(): void
  error?: string | null
}) {
  const [over, setOver] = useState(false)
  return (
    <Dialog
      title="Import Watchlist"
      onClose={onClose}
      footer={<button onClick={onClose}>Cancel</button>}
    >
      <label
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
        <span>Drop an IMDb CSV export here, or click to choose</span>
      </label>
      <p className="dim">
        IMDb ▸ Your Watchlist ▸ ⋯ ▸ Export. Ratings and custom-list exports work too.
      </p>
      {error && <p className="err">{error}</p>}
    </Dialog>
  )
}

export function SearchLinkDialog({
  initial,
  sampleTitle,
  build,
  validate,
  presets,
  onSave,
  onClose,
}: {
  initial: string
  sampleTitle: string
  build(template: string): string
  validate(template: string): string | null
  presets: { label: string; template: string }[]
  onSave(template: string): void
  onClose(): void
}) {
  const [value, setValue] = useState(initial)
  const error = validate(value)

  return (
    <Dialog
      title="Watch Link"
      onClose={onClose}
      footer={
        <>
          <button disabled={!!error} onClick={() => onSave(value.trim())}>
            Save
          </button>
          <button onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p>
        Where <b>⏎</b> sends you. Use <code>{'{title}'}</code>, <code>{'{year}'}</code> or{' '}
        <code>{'{imdb}'}</code>. A URL with no placeholder gets the title appended.
      </p>
      <input
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="https://example.com/search?q={title}"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && !error) onSave(value.trim())
          if (e.key === 'Escape') onClose()
        }}
      />
      <div className="presets">
        {presets.map((p) => (
          <button key={p.label} className="chip" onClick={() => setValue(p.template)}>
            {p.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="err">{error}</p>
      ) : (
        <p className="preview">
          <span className="dim">{sampleTitle} →</span> {build(value)}
        </p>
      )}
    </Dialog>
  )
}

export function ProgressDialog({
  label,
  done,
  total,
  onCancel,
}: {
  label: string
  done: number
  total: number
  onCancel(): void
}) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <Dialog title="Fetching from TMDB" onClose={onCancel} footer={<button onClick={onCancel}>Stop</button>}>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p>
        {done} / {total} — {pct}%
      </p>
      <p className="dim ellipsis">{label}</p>
    </Dialog>
  )
}
