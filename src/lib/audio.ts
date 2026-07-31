/**
 * Synthesised UI sounds.
 *
 * The real XMB cursor blips are Sony assets and are not redistributable, so
 * these are built from oscillators at call time. Web Audio (not <audio>)
 * because element playback latency is tens of milliseconds and the cursor
 * feel dies with it.
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.18
    master.connect(ctx.destination)
  }
  // Browsers start the context suspended until a user gesture.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

/**
 * Unlocks audio on first use. Deferred to a microtask so it runs *after* the
 * handler that called it: `AudioContext.resume()` spends the page's transient
 * user activation, and the Enter handler spends the same activation opening
 * the watch link. Ordering it last removes any contention between the two.
 */
export function unlockAudio(): void {
  queueMicrotask(() => {
    ac()
  })
}

interface BlipOpts {
  freq: number
  freqTo?: number
  dur: number
  type?: OscillatorType
  gain?: number
  delay?: number
}

function blip({ freq, freqTo, dur, type = 'sine', gain = 1, delay = 0 }: BlipOpts): void {
  const c = ac()
  if (!c || !master) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sfx = {
  move(): void {
    if (!enabled) return
    blip({ freq: 1560, freqTo: 1180, dur: 0.055, type: 'triangle', gain: 0.5 })
    blip({ freq: 3120, dur: 0.03, type: 'sine', gain: 0.12 })
  },
  lateral(): void {
    if (!enabled) return
    blip({ freq: 980, freqTo: 1440, dur: 0.07, type: 'triangle', gain: 0.45 })
  },
  enter(): void {
    if (!enabled) return
    blip({ freq: 880, dur: 0.09, type: 'sine', gain: 0.5 })
    blip({ freq: 1320, dur: 0.14, type: 'sine', gain: 0.4, delay: 0.045 })
    blip({ freq: 1760, dur: 0.2, type: 'sine', gain: 0.22, delay: 0.09 })
  },
  back(): void {
    if (!enabled) return
    blip({ freq: 760, freqTo: 420, dur: 0.13, type: 'triangle', gain: 0.45 })
  },
  error(): void {
    if (!enabled) return
    blip({ freq: 220, dur: 0.16, type: 'square', gain: 0.28 })
  },
}
