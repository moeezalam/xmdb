import { useEffect, useRef, useState } from 'react'

interface Layer {
  key: number
  url: string | null
  gradient: string
  ready: boolean
}

let seq = 0

/**
 * PIC1 slot: the full-screen plate behind the XMB.
 *
 * A new plate is only faded in once its image has actually decoded, so fast
 * scrolling never flashes a half-loaded backdrop. At most two layers are kept
 * alive; the outgoing one is dropped when its transition ends.
 */
export function Backdrop({ url, gradient }: { url: string | null; gradient: string }) {
  const [layers, setLayers] = useState<Layer[]>([])
  const currentUrl = useRef<string | null>(null)
  const currentGrad = useRef<string>('')

  useEffect(() => {
    if (url === currentUrl.current && gradient === currentGrad.current) return
    currentUrl.current = url
    currentGrad.current = gradient
    const key = ++seq

    const add = () =>
      setLayers((prev) => [...prev.slice(-1), { key, url, gradient, ready: true }])

    if (!url) {
      add()
      return
    }

    const img = new Image()
    img.decoding = 'async'
    let cancelled = false
    img.onload = () => {
      // The selection may have moved on while this was in flight.
      if (!cancelled && currentUrl.current === url) add()
    }
    img.onerror = () => {
      // Broken TMDB path: fall back to the placeholder gradient rather than
      // leaving the previous title's art on screen.
      if (!cancelled && currentUrl.current === url) {
        setLayers((prev) => [...prev.slice(-1), { key, url: null, gradient, ready: true }])
      }
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [url, gradient])

  return (
    <div className="backdrop">
      {layers.map((l, i) => (
        <div
          key={l.key}
          className={`backdrop-layer ${i === layers.length - 1 ? 'in' : 'out'}`}
          style={
            l.url
              ? { backgroundImage: `url(${l.url})` }
              : { backgroundImage: l.gradient }
          }
          onTransitionEnd={() => {
            if (i !== layers.length - 1) setLayers((prev) => prev.filter((x) => x.key !== l.key))
          }}
        />
      ))}
      <div className="backdrop-scrim" />
    </div>
  )
}
