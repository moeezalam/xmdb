import { PANEL_W, PANEL_X, SEL_Y } from '../lib/layout'
import type { MenuItem } from '../lib/types'

/**
 * PIC0 slot: the metadata plate. Sits below the selected row so it never
 * collides with the category bar, which spans the full width at CAT_Y.
 */
export function InfoPanel({ item }: { item: MenuItem | undefined }) {
  // Group and action rows say everything they have to say in their sublabel,
  // which the selection label already renders. Repeating it here reads as a bug.
  const t = item?.title
  if (!t) return null

  return (
    <div className="info" style={{ left: PANEL_X, top: SEL_Y + 44, width: PANEL_W }}>
      {t.genres.length > 0 && (
        <div className="info-line">
          <span className="chips">{t.genres.slice(0, 4).join(' · ')}</span>
        </div>
      )}
      {t.directors.length > 0 && (
        <div className="info-line dim">
          <span className="k">Dir</span> {t.directors.join(', ')}
        </div>
      )}
      {t.cast && t.cast.length > 0 && (
        <div className="info-line dim">
          <span className="k">Cast</span> {t.cast.slice(0, 4).join(', ')}
        </div>
      )}
      {t.overview && <div className="info-overview">{t.overview}</div>}
      {!t.overview && !t.enriched && (
        <div className="info-overview dim">
          No TMDB data yet — Settings ▸ TMDB Artwork &amp; Trailers.
        </div>
      )}
    </div>
  )
}
