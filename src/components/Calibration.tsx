import { useEffect, useState } from 'react'
import { CAT_Y, CROSS_X, SCREEN_H, SCREEN_W, SEL_Y } from '../lib/layout'

/**
 * Calibration overlay, toggled with `C`.
 *
 * Drop a native 480x272 PSP capture at public/calibration.png, press C, and
 * tune the constants in src/lib/layout.ts until the two line up. `[` and `]`
 * change the overlay opacity; `G` adds a grid and the cross-point crosshair so
 * the geometry is checkable even without a reference image.
 */
export function Calibration({ onClose }: { onClose(): void }) {
  const [opacity, setOpacity] = useState(0.5)
  const [grid, setGrid] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '[') setOpacity((o) => Math.max(0, +(o - 0.1).toFixed(2)))
      if (e.key === ']') setOpacity((o) => Math.min(1, +(o + 0.1).toFixed(2)))
      if (e.key.toLowerCase() === 'g') setGrid((g) => !g)
      if (e.key.toLowerCase() === 'c' || e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="calib">
      <img
        className="calib-img"
        src={`${import.meta.env.BASE_URL}calibration.png`}
        alt=""
        style={{ opacity }}
        onError={() => setMissing(true)}
      />
      {grid && (
        <svg className="calib-grid" viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}>
          {Array.from({ length: Math.floor(SCREEN_W / 20) }, (_, i) => (
            <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={SCREEN_H} className="g" />
          ))}
          {Array.from({ length: Math.floor(SCREEN_H / 20) }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 20} x2={SCREEN_W} y2={i * 20} className="g" />
          ))}
          <line x1={CROSS_X} y1={0} x2={CROSS_X} y2={SCREEN_H} className="x" />
          <line x1={0} y1={CAT_Y} x2={SCREEN_W} y2={CAT_Y} className="x" />
          <line x1={0} y1={SEL_Y} x2={SCREEN_W} y2={SEL_Y} className="y" />
        </svg>
      )}
      <div className="calib-hud">
        <b>CALIBRATION</b> · opacity {opacity.toFixed(1)} <span className="dim">[ ]</span> · grid{' '}
        <span className="dim">G</span> · close <span className="dim">C</span>
        <br />
        CROSS_X {CROSS_X} · CAT_Y {CAT_Y} · SEL_Y {SEL_Y}
        {missing && (
          <>
            <br />
            <span className="err">
              public/calibration.png not found — drop a 480×272 PSP capture there.
            </span>
          </>
        )}
      </div>
    </div>
  )
}
