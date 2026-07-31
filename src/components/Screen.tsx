import { useEffect, useRef, type ReactNode } from 'react'
import { SCREEN_H, SCREEN_W } from '../lib/layout'

/**
 * The 480x272 PSP canvas. Everything inside is authored in PSP pixels; this
 * component applies the single transform that scales it to the viewport and
 * letterboxes the remainder. This is what makes the clone "exact" rather than
 * "responsive" — there are no breakpoints anywhere else in the app.
 */
export function Screen({ children, crt }: { children: ReactNode; crt: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const fit = () => {
      const k = Math.min(window.innerWidth / SCREEN_W, window.innerHeight / SCREEN_H)
      host.style.setProperty('--k', String(k))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <div className="screen-host" ref={hostRef}>
      <div className="screen" style={{ width: SCREEN_W, height: SCREEN_H }}>
        {children}
        {crt && <div className="crt" />}
      </div>
    </div>
  )
}
