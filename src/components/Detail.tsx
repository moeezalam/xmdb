import { backdropUrl, logoUrl, placeholderGradient, posterUrl } from '../lib/art'
import { buildSearchUrl } from '../lib/searchLink'
import { EMPTY_SAVE, type SaveData, type Title } from '../lib/types'

/** Full-screen "game info" page, reached with △ / Tab on a title. */
export function Detail({
  t,
  save = EMPTY_SAVE,
  searchTemplate,
  onToggleWatched,
  onToggleFavourite,
  onClose,
}: {
  t: Title
  save?: SaveData
  searchTemplate: string
  onToggleWatched(): void
  onToggleFavourite(): void
  onClose(): void
}) {
  const bd = backdropUrl(t)
  const poster = posterUrl(t)
  const logo = logoUrl(t)
  const pct = Math.round(save.progress * 100)

  return (
    <div className="detail" onClick={onClose}>
      <div
        className="detail-bg"
        style={bd ? { backgroundImage: `url(${bd})` } : { backgroundImage: placeholderGradient(t) }}
      />
      <div className="detail-scrim" />
      <div className="detail-body">
        <div
          className="detail-poster"
          style={poster ? { backgroundImage: `url(${poster})` } : { backgroundImage: placeholderGradient(t) }}
        />
        <div className="detail-text">
          {logo ? (
            <img className="detail-logo" src={logo} alt={t.title} />
          ) : (
            <h1>{t.title}</h1>
          )}
          {t.tagline && <div className="detail-tagline">{t.tagline}</div>}
          <div className="detail-meta">
            {[
              t.year,
              t.titleType !== 'Movie' ? t.titleType : null,
              t.runtime ? `${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`.replace(/^0h /, '') : null,
              t.imdbRating ? `IMDb ★ ${t.imdbRating.toFixed(1)}` : null,
              t.numVotes ? `${(t.numVotes / 1000).toFixed(0)}k votes` : null,
            ]
              .filter(Boolean)
              .join('   ·   ')}
          </div>
          {t.genres.length > 0 && <div className="detail-genres">{t.genres.join(' · ')}</div>}
          {t.overview && <p className="detail-overview">{t.overview}</p>}
          {t.directors.length > 0 && (
            <div className="detail-credit">
              <span className="k">Directed by</span> {t.directors.join(', ')}
            </div>
          )}
          {t.cast?.length ? (
            <div className="detail-credit">
              <span className="k">Starring</span> {t.cast.join(', ')}
            </div>
          ) : null}
          {(save.watched || save.favourite || pct > 0) && (
            <div className="detail-marks">
              {save.watched && <span className="mark on">✓ Watched</span>}
              {save.favourite && <span className="mark fav">★ Favourite</span>}
              {pct > 0 && pct < 100 && <span className="mark">{pct}% watched</span>}
            </div>
          )}
          <div className="detail-links">
            <a
              className="detail-link primary"
              href={buildSearchUrl(searchTemplate, t)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
            >
              ▶ Watch ↗
            </a>
            <button
              className="detail-link"
              onClick={(e) => {
                e.stopPropagation()
                onToggleWatched()
              }}
            >
              {save.watched ? '✓ Watched' : 'Mark watched'}
            </button>
            <button
              className="detail-link"
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavourite()
              }}
            >
              {save.favourite ? '★ Favourite' : 'Favourite'}
            </button>
            <a
              className="detail-link"
              href={`https://www.imdb.com/title/${t.imdbId}/`}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
            >
              IMDb ↗
            </a>
          </div>
        </div>
      </div>
      <div className="detail-hint">○ Back</div>
    </div>
  )
}
