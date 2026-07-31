import { REPEAT_ACCEL, REPEAT_DELAY, REPEAT_FAST } from './layout'

export type Dir = 'up' | 'down' | 'left' | 'right'
export type Btn = 'enter' | 'back' | 'options' | 'start' | 'watched' | 'favourite'
/** Progress nudge, in points of 100. */
export type ProgressDelta = number

export interface InputHandlers {
  onDir(dir: Dir): void
  onBtn(btn: Btn): void
  /**
   * Coarse jump within the current column. A 600-title list is 34 seconds of
   * held d-pad at the fastest repeat, so page jumps are not optional.
   * delta is ±PAGE, or ±Infinity for Home/End.
   */
  onPage?(delta: number): void
  /** Nudge the selected title's progress by `delta` points of 100. */
  onProgress?(delta: ProgressDelta): void
  /** Raw printable keys, so Search can be typed into without a focused input. */
  onText?(ch: string): void
  onBackspace?(): void
  /** True while a modal owns the keyboard: no navigation, no text. */
  isBlocked?(): boolean
  /**
   * True while a text field (Search) is live. Arrows still navigate, but the
   * WASD aliases must fall through to onText or the user cannot type "a".
   */
  isTyping?(): boolean
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

const KEY_BTN: Record<string, Btn> = {
  Enter: 'enter',
  Space: 'enter',
  Escape: 'back',
  Backspace: 'back',
  Tab: 'options',
  // Not W/F: those collide with the WASD movement aliases and with typing.
  KeyM: 'watched',
  KeyB: 'favourite',
}

/** Progress nudge in points; `-`/`=` are next to each other on every layout. */
const KEY_PROGRESS: Record<string, number> = {
  Minus: -10,
  Equal: 10,
  BracketLeft: -10,
  BracketRight: 10,
}

/** Rows skipped by PageUp/PageDown and the shoulder buttons. */
export const PAGE = 12

const KEY_PAGE: Record<string, number> = {
  PageUp: -PAGE,
  PageDown: PAGE,
  Home: -Infinity,
  End: Infinity,
}

/**
 * Directional input with XMB's accelerating auto-repeat: one step on press,
 * a long pause, then an interval that ramps down to a fast scroll. Getting
 * this curve wrong is the single biggest tell that a clone is not a PSP.
 */
export function attachInput(h: InputHandlers): () => void {
  let heldDir: Dir | null = null
  let nextFireAt = 0
  let interval = REPEAT_DELAY
  let raf = 0
  const prevButtons = new Map<number, boolean>()
  let padAxisDir: Dir | null = null

  const blocked = () => h.isBlocked?.() ?? false
  const typing = () => h.isTyping?.() ?? false

  function press(dir: Dir) {
    if (heldDir === dir) return
    heldDir = dir
    interval = REPEAT_DELAY
    nextFireAt = performance.now() + interval
    h.onDir(dir)
  }

  function release(dir: Dir) {
    if (heldDir === dir) heldDir = null
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // A focused form control inside a dialog owns its own keys entirely.
    const el = e.target as HTMLElement | null
    if (el?.closest?.('input, textarea, [contenteditable="true"]')) return

    if (blocked()) {
      // Escape is the one key a modal must never swallow.
      if (e.code === 'Escape') {
        e.preventDefault()
        h.onBtn('back')
      }
      return
    }

    const page = KEY_PAGE[e.code]
    if (page !== undefined) {
      e.preventDefault()
      h.onPage?.(page)
      return
    }

    // While typing, every letter key is a letter — not a direction (WASD) and
    // not a save-data shortcut (M/B).
    const letterKey = e.code.startsWith('Key')
    const suppressed = typing() && letterKey

    const dir = KEY_DIR[e.code]
    if (dir && !suppressed) {
      e.preventDefault()
      press(dir)
      return
    }
    const btn = KEY_BTN[e.code]
    if (btn && !suppressed) {
      e.preventDefault()
      h.onBtn(btn)
      return
    }
    const nudge = KEY_PROGRESS[e.code]
    if (nudge !== undefined && !typing()) {
      e.preventDefault()
      h.onProgress?.(nudge)
      return
    }
    if (e.key.length === 1) h.onText?.(e.key)
  }

  function onKeyUp(e: KeyboardEvent) {
    const dir = KEY_DIR[e.code]
    if (dir) release(dir)
  }

  function pollPad(now: number) {
    const pads = navigator.getGamepads?.() ?? []
    const pad = Array.from(pads).find((p): p is Gamepad => !!p)
    if (!pad) {
      padAxisDir = null
      return
    }

    // D-pad on the standard mapping is buttons 12..15.
    const dpad: [number, Dir][] = [
      [12, 'up'],
      [13, 'down'],
      [14, 'left'],
      [15, 'right'],
    ]
    let want: Dir | null = null
    for (const [i, dir] of dpad) if (pad.buttons[i]?.pressed) want = dir

    // Left stick, with a dead zone.
    if (!want) {
      const [x, y] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0]
      const DEAD = 0.55
      if (Math.abs(y) > Math.abs(x)) {
        if (y < -DEAD) want = 'up'
        else if (y > DEAD) want = 'down'
      } else {
        if (x < -DEAD) want = 'left'
        else if (x > DEAD) want = 'right'
      }
    }

    if (want && want !== padAxisDir && !blocked()) press(want)
    if (!want && padAxisDir) release(padAxisDir)
    padAxisDir = want

    // Shoulder buttons page through long columns.
    for (const [i, delta] of [
      [4, -PAGE],
      [5, PAGE],
    ] as [number, number][]) {
      const down = !!pad.buttons[i]?.pressed
      if (down && !prevButtons.get(i) && !blocked()) h.onPage?.(delta)
      prevButtons.set(i, down)
    }

    // Cross launches, Circle backs out, Square marks watched, Triangle opens
    // the info page — the PSP's own button roles.
    const face: [number, Btn][] = [
      [0, 'enter'],
      [1, 'back'],
      [2, 'watched'],
      [3, 'options'],
      [9, 'start'],
      [11, 'favourite'],
    ]
    for (const [i, btn] of face) {
      const down = !!pad.buttons[i]?.pressed
      // Circle must still dismiss a modal, so 'back' is exempt from blocking.
      if (down && !prevButtons.get(i) && (!blocked() || btn === 'back')) h.onBtn(btn)
      prevButtons.set(i, down)
    }
    void now
  }

  function loop() {
    const now = performance.now()
    pollPad(now)
    if (heldDir && now >= nextFireAt) {
      if (!blocked()) h.onDir(heldDir)
      interval = Math.max(REPEAT_FAST, interval * REPEAT_ACCEL)
      nextFireAt = now + interval
    }
    raf = requestAnimationFrame(loop)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  // A dropped keyup (alt-tab mid-hold) would otherwise scroll forever.
  window.addEventListener('blur', () => {
    heldDir = null
  })
  raf = requestAnimationFrame(loop)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    cancelAnimationFrame(raf)
  }
}
