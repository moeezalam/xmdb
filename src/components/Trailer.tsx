import { useEffect, useRef, useState } from 'react'
import { ICON_SEL_W } from '../lib/layout'

/**
 * ICON1 slot: the PSP played an animated icon inside the 144x80 tile, not in a
 * hero banner. TMDB and Cinemeta only hand out YouTube ids, so this is a
 * YouTube player sized to that tile.
 *
 * Two problems with a bare <iframe> embed, both visible on screen:
 *
 *  1. The player shows its own chrome — video title top-left, channel
 *     watermark bottom-right, and a large play/pause button in the middle —
 *     during the load and buffer phase.
 *  2. `autoplay=1` is a request, not a promise. When the browser declines it,
 *     the tile sits on YouTube's paused poster with the play button over it.
 *
 * So this drives the IFrame Player API instead and keeps the player invisible
 * until it reports PLAYING. Until then the tile shows its still artwork, which
 * is the correct fallback anyway. The player is then overscaled and
 * centre-cropped so the title and watermark fall outside the tile.
 */

/*
 * The player is built at a normal desktop size and then scaled down to the
 * tile, rather than being built at tile size.
 *
 * This matters: YouTube lays its chrome out against the iframe's CSS size, and
 * at ~112px wide it switches to a tiny-player layout where the video title and
 * the centre play button are enormous relative to the frame — they filled the
 * whole tile. Rendered at 640x360 the chrome is normally proportioned, and
 * shrinking by ~0.26 makes it small enough to fall inside the crop.
 */
const PLAYER_W = 640
const PLAYER_H = 360

/*
 * YouTube keeps drawing chrome over the video even while it plays — traced it:
 * the player reports PLAYING once and never pauses, yet a ⏮ ⏸ ⏭ cluster sits
 * across the middle and a "More videos" strip across the bottom. So hiding on
 * pause is not enough and nothing centred can be cropped away by scaling
 * alone.
 *
 * Measured against the player's own height, the chrome occupies roughly:
 *
 *   0.00 – 0.12   video title, top-left
 *   0.44 – 0.56   transport controls, centred
 *   0.80 – 1.00   progress bar and "More videos"
 *
 * which leaves a clean band from 0.12 to 0.44. The player is blown up until
 * the tile is small enough to sit inside that band, then pushed down so the
 * band is what shows. The tile ends up as a close-up of the trailer, which at
 * 112x62 is the right read anyway — the PSP's animated icons were tight crops
 * too.
 */
const OVERSCALE = 3.5
/** Puts the tile window at 0.28 of the player height — the middle of the band. */
const OFFSET_Y = 48
const SCALE = (ICON_SEL_W * OVERSCALE) / PLAYER_W

/**
 * Grace period after PLAYING before the player is revealed. YouTube auto-hides
 * its chrome a beat after playback starts; waiting means the fade never
 * catches the title card or the control fade-out.
 */
const REVEAL_DELAY = 900
/** If it has not reported PLAYING by now, it never will — stay on the still. */
const PLAY_TIMEOUT = 6000

interface YTPlayer {
  destroy(): void
  mute(): void
  playVideo(): void
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
}
type WindowWithYT = Window & {
  YT?: YTNamespace
  onYouTubeIframeAPIReady?: () => void
}

let apiPromise: Promise<YTNamespace> | null = null

/** Loads the IFrame API once per page and resolves with the YT namespace. */
function loadApi(): Promise<YTNamespace> {
  const w = window as WindowWithYT
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    if (w.YT?.Player) {
      resolve(w.YT)
      return
    }
    // The API calls this global when it is ready; chain any existing one
    // rather than clobbering it.
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (w.YT) resolve(w.YT)
      else reject(new Error('YouTube API loaded without a YT namespace'))
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => reject(new Error('YouTube IFrame API failed to load'))
    document.head.appendChild(s)
  })

  // A failed load must not poison every later attempt.
  apiPromise.catch(() => {
    apiPromise = null
  })
  return apiPromise
}

export function Trailer({ videoKey }: { videoKey: string }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let cancelled = false
    let player: YTPlayer | null = null
    let timer = 0
    let revealTimer = 0
    setPlaying(false)

    void loadApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return
        // YT.Player replaces the element it is given, so hand it a child that
        // is safe to lose rather than the container React owns.
        const host = document.createElement('div')
        mountRef.current.appendChild(host)

        player = new YT.Player(host, {
          videoId: videoKey,
          width: PLAYER_W,
          height: PLAYER_H,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            loop: 1,
            playlist: videoKey,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              // Muting again here is what makes autoplay legal in Chrome.
              e.target.mute()
              e.target.playVideo()
            },
            onStateChange: (e: { data: number; target: YTPlayer }) => {
              if (cancelled) return
              if (e.data === YT.PlayerState.PLAYING) {
                window.clearTimeout(revealTimer)
                revealTimer = window.setTimeout(() => {
                  if (!cancelled) setPlaying(true)
                }, REVEAL_DELAY)
                return
              }
              if (e.data === YT.PlayerState.ENDED) {
                // `loop` is unreliable for a single video; restart by hand.
                e.target.playVideo()
                return
              }
              if (e.data === YT.PlayerState.PAUSED) {
                /*
                 * A pause is what draws YouTube's ⏮ ⏸ ⏭ overlay across the
                 * middle of the tile, and cropping cannot remove something
                 * that is centred. So the moment the player stops playing it
                 * is hidden again and the still artwork takes over, then we
                 * ask it to resume. The overlay is never on screen.
                 */
                window.clearTimeout(revealTimer)
                setPlaying(false)
                e.target.playVideo()
              }
            },
            onError: () => {
              // Region-locked or embedding disabled — keep the still artwork.
              if (!cancelled) setPlaying(false)
            },
          },
        })

        timer = window.setTimeout(() => {
          if (!cancelled) setPlaying((p) => p)
        }, PLAY_TIMEOUT)
      })
      .catch((err) => {
        console.warn('Trailer unavailable:', (err as Error).message)
      })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(revealTimer)
      try {
        player?.destroy()
      } catch {
        // destroy() throws if the iframe is already gone; nothing to do.
      }
    }
  }, [videoKey])

  return (
    <div className={`trailer ${playing ? 'playing' : ''}`} aria-hidden="true">
      <div
        className="trailer-crop"
        ref={mountRef}
        style={{
          width: PLAYER_W,
          height: PLAYER_H,
          transform: `translate(-50%, calc(-50% + ${OFFSET_Y}px)) scale(${SCALE})`,
        }}
      />
    </div>
  )
}
