import type { SaveData } from '../lib/types'

/**
 * The save-data marks on a tile.
 *
 * The PSP put a small save-data icon on titles you had played; this is that
 * idea with three states layered on one tile — watched, favourite, and a
 * progress bar along the bottom edge. Kept to glyph-free shapes so it reads at
 * the 54px unselected size as well as the 112px selected one.
 */
export function SaveBadge({ save, big }: { save: SaveData; big: boolean }) {
  const inProgress = save.progress > 0 && save.progress < 1
  if (!save.watched && !save.favourite && !inProgress) return null

  return (
    <>
      <div className={`badges ${big ? 'big' : ''}`}>
        {save.watched && (
          <span className="badge watched" title="Watched">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.4 6.3 4.7 8.6 9.6 3.6" />
            </svg>
          </span>
        )}
        {save.favourite && (
          <span className="badge fav" title="Favourite">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 1.4 7.5 4.5l3.4.5-2.5 2.4.6 3.4L6 9.2 2.9 10.8l.6-3.4L1 5l3.4-.5z" />
            </svg>
          </span>
        )}
      </div>
      {inProgress && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${save.progress * 100}%` }} />
        </div>
      )}
    </>
  )
}
