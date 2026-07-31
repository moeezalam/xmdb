import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  BOTTOM_FADE_FROM,
  BOTTOM_FADE_TO,
  CAT_ICON_SEL,
  CAT_ICON_UNSEL,
  CAT_SPACING,
  CAT_WINDOW,
  CAT_Y,
  CROSS_X,
  DEPTH_SHIFT,
  FALLOFF,
  ICON_SEL_H,
  ICON_SEL_W,
  ICON_UNSEL_W,
  ITEM_SPACING,
  ITEM_WINDOW,
  SEL_Y,
  TAU,
  TOP_FADE_FROM,
  TOP_FADE_TO,
} from '../lib/layout'
import { iconUrl, monogram, placeholderGradient } from '../lib/art'
import { buildSearchUrl } from '../lib/searchLink'
import { EMPTY_SAVE, type Category, type MenuItem, type SaveMap } from '../lib/types'
import { Icon } from './Icons'
import { SaveBadge } from './SaveBadge'
import { Trailer } from './Trailer'

export interface ColumnState {
  items: MenuItem[]
  index: number
}

interface Props {
  categories: Category[]
  catIndex: number
  stack: ColumnState[]
  /** YouTube key to play in the ICON1 tile, or null. */
  trailerKey: string | null
  saves: SaveMap
  searchTemplate: string
  onPick(catIndex: number, depth: number, itemIndex: number): void
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const UNSEL_SCALE = ICON_UNSEL_W / ICON_SEL_W

/**
 * The cross itself.
 *
 * React owns discrete state (which index is selected); per-frame transforms are
 * written straight to the DOM from one rAF loop. Re-rendering 15 nodes at 60 Hz
 * through React would cost more than the whole rest of the app.
 */
export function Xmb({
  categories,
  catIndex,
  stack,
  trailerKey,
  saves,
  searchTemplate,
  onPick,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const catRowRef = useRef<HTMLDivElement>(null)
  const catRefs = useRef(new Map<string, HTMLElement>())
  const itemRefs = useRef(new Map<string, HTMLElement>())

  // Animated scalars, mutated by rAF only.
  const anim = useRef({ cat: catIndex, item: 0, depth: 0 })
  // Targets, mutated by render only.
  const target = useRef({ cat: catIndex, item: 0, depth: 0 })

  const activeDepth = stack.length - 1
  const active = stack[activeDepth]

  target.current.cat = catIndex
  target.current.item = active?.index ?? 0
  target.current.depth = activeDepth

  // Read through a ref so the snap effects below depend only on the events that
  // should trigger them, not on every index change.
  const pendingIndex = useRef(0)
  pendingIndex.current = active?.index ?? 0

  // Changing category or column depth snaps the scroll position instead of
  // animating through hundreds of rows — which is what the real XMB does.
  useLayoutEffect(() => {
    anim.current.item = pendingIndex.current
  }, [catIndex])
  useLayoutEffect(() => {
    if (activeDepth !== Math.round(anim.current.depth)) anim.current.item = pendingIndex.current
  }, [activeDepth])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = () => {
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const k = 1 - Math.exp(-dt / TAU)

      const a = anim.current
      const t = target.current
      a.cat += (t.cat - a.cat) * k
      a.item += (t.item - a.item) * k
      a.depth += (t.depth - a.depth) * k
      if (Math.abs(t.cat - a.cat) < 0.0005) a.cat = t.cat
      if (Math.abs(t.item - a.item) < 0.0005) a.item = t.item
      if (Math.abs(t.depth - a.depth) < 0.0005) a.depth = t.depth

      const shift = a.depth * DEPTH_SHIFT

      // --- category row ---
      const row = catRowRef.current
      if (row) row.style.transform = `translate3d(${CROSS_X - a.cat * CAT_SPACING - shift}px,0,0)`
      for (const el of catRefs.current.values()) {
        const i = Number(el.dataset.i)
        const d = i - a.cat
        const ad = Math.abs(d)
        const s = CAT_ICON_UNSEL / CAT_ICON_SEL + (1 - CAT_ICON_UNSEL / CAT_ICON_SEL) * (1 - smoothstep(0, 1, ad))
        el.style.transform = `translate(-50%,-50%) scale(${s.toFixed(4)})`
        el.style.opacity = (clamp01(1 / (1 + ad * FALLOFF)) * clamp01(1.6 - ad / CAT_WINDOW)).toFixed(3)
      }

      // --- item columns ---
      for (const el of itemRefs.current.values()) {
        const depth = Number(el.dataset.depth)
        const i = Number(el.dataset.i)
        const isActive = depth === Math.round(t.depth)
        const pos = isActive ? a.item : Number(el.dataset.pos)
        const colX = CROSS_X - (a.depth - depth) * DEPTH_SHIFT

        const d = i - pos
        const ad = Math.abs(d)
        const y = SEL_Y + d * ITEM_SPACING
        const s = UNSEL_SCALE + (1 - UNSEL_SCALE) * (1 - smoothstep(0, 1, ad))
        const topFade =
          smoothstep(TOP_FADE_FROM, TOP_FADE_TO, y) *
          smoothstep(BOTTOM_FADE_FROM, BOTTOM_FADE_TO, y)
        const depthFade = isActive ? 1 : 0.28
        const distFade = clamp01(1 / (1 + ad * FALLOFF)) * clamp01(1.4 - ad / ITEM_WINDOW)

        el.style.transform = `translate3d(${colX}px,${y}px,0) translate(-50%,-50%) scale(${s.toFixed(4)})`
        el.style.opacity = (topFade * depthFade * distFade).toFixed(3)
        el.style.zIndex = String(100 - Math.round(ad * 10))
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const catFrom = Math.max(0, catIndex - CAT_WINDOW)
  const catTo = Math.min(categories.length - 1, catIndex + CAT_WINDOW)

  return (
    <div className="xmb" ref={rootRef}>
      <div className="cat-row" ref={catRowRef}>
        {categories.slice(catFrom, catTo + 1).map((c, n) => {
          const i = catFrom + n
          return (
            <div
              key={c.id}
              className={`cat ${i === catIndex ? 'sel' : ''}`}
              data-i={i}
              style={{ left: i * CAT_SPACING, top: CAT_Y }}
              ref={(el) => {
                if (el) catRefs.current.set(c.id, el)
                else catRefs.current.delete(c.id)
              }}
              onClick={() => onPick(i, 0, 0)}
            >
              <div className="cat-icon">
                <Icon name={c.icon} size={CAT_ICON_SEL} />
              </div>
              {i === catIndex && <div className="cat-label">{c.label}</div>}
            </div>
          )
        })}
      </div>

      {stack.map((col, depth) => {
        const isActive = depth === activeDepth
        const win = isActive ? ITEM_WINDOW : 2
        const from = Math.max(0, col.index - win)
        const to = Math.min(col.items.length - 1, col.index + win)
        const slice: MenuItem[] = []
        for (let i = from; i <= to; i++) slice.push(col.items[i])

        return slice.map((it, n) => {
          const i = from + n
          const sel = isActive && i === col.index
          const t = it.title
          const url = t ? iconUrl(t) : null
          const save = t ? (saves[t.imdbId] ?? EMPTY_SAVE) : EMPTY_SAVE
          return (
            <div
              key={`${depth}:${it.id}`}
              className={`row ${sel ? 'sel' : ''}`}
              data-depth={depth}
              data-i={i}
              data-pos={col.index}
              style={{ width: ICON_SEL_W, height: ICON_SEL_H }}
              ref={(el) => {
                const k = `${depth}:${it.id}`
                if (el) itemRefs.current.set(k, el)
                else itemRefs.current.delete(k)
              }}
            >
              {/*
                A real anchor, so a click on the selected tile is an ordinary
                navigation the popup blocker never touches — and middle-click
                and "copy link address" work. A click on any other row is just
                a selection, so the navigation is cancelled there.
              */}
              <a
                className={`tile ${save.watched ? 'is-watched' : ''}`}
                href={t ? buildSearchUrl(searchTemplate, t) : undefined}
                target={t ? '_blank' : undefined}
                rel="noopener noreferrer"
                tabIndex={-1}
                onClick={(e) => {
                  if (!t || !sel) e.preventDefault()
                  onPick(catIndex, depth, i)
                }}
                style={
                  url
                    ? { backgroundImage: `url(${url})` }
                    : { backgroundImage: t ? placeholderGradient(t) : 'none' }
                }
              >
                {!url && t && <span className="mono">{monogram(t)}</span>}
                {!t && (
                  <span className="glyph">
                    <Icon name={it.icon ?? 'folder'} size={34} />
                  </span>
                )}
                {sel && trailerKey && <Trailer videoKey={trailerKey} />}
                {t && <SaveBadge save={save} big={sel} />}
              </a>
              {it.children && <span className="has-children">▸</span>}
            </div>
          )
        })
      })}
    </div>
  )
}
