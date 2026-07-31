import { ICON_SEL_H, ICON_SEL_W } from '../lib/layout'

/**
 * ICON1 slot: the PSP played an animated icon inside the 144x80 tile, not in a
 * hero banner. TMDB only hands out YouTube keys, so this is a bare embed sized
 * to cover the tile.
 *
 * Known limits, unhandled by design: embeds that are region-locked or have
 * embedding disabled render a YouTube error card. The tile keeps the still
 * image underneath, so the failure degrades to "no motion" rather than a hole.
 */
export function Trailer({ videoKey }: { videoKey: string }) {
  // Cover the tile: YouTube letterboxes to 16:9, so oversize and clip.
  const w = ICON_SEL_W
  const h = Math.ceil((w * 9) / 16)
  const top = (ICON_SEL_H - h) / 2

  const src =
    `https://www.youtube-nocookie.com/embed/${videoKey}` +
    `?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1` +
    `&loop=1&playlist=${videoKey}&rel=0&disablekb=1&fs=0&iv_load_policy=3`

  return (
    <div className="trailer" style={{ width: ICON_SEL_W, height: ICON_SEL_H }}>
      <iframe
        src={src}
        width={w}
        height={h}
        style={{ top }}
        frameBorder={0}
        allow="autoplay; encrypted-media"
        title="trailer"
        tabIndex={-1}
      />
    </div>
  )
}
