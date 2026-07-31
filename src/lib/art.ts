import type { Title } from './types'

/** FNV-1a — stable across sessions, unlike anything derived from array order. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Deterministic placeholder art, so the UI is fully populated before the user
 * has supplied a TMDB key. Each title gets a stable two-stop gradient derived
 * from its IMDb id.
 */
export function placeholderGradient(t: Title): string {
  const h = hash(t.imdbId)
  const hue = h % 360
  const hue2 = (hue + 40 + ((h >> 9) % 60)) % 360
  const ang = 110 + ((h >> 17) % 60)
  return `linear-gradient(${ang}deg, hsl(${hue} 62% 26%), hsl(${hue2} 58% 12%))`
}

/** Two-letter monogram used on placeholder tiles. */
export function monogram(t: Title): string {
  const words = t.title.replace(/^(the|a|an)\s+/i, '').split(/\s+/).filter(Boolean)
  if (!words.length) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * ICON0 slot: 144x80 on a real PSP, so the landscape backdrop is the natural
 * fit; the poster is the fallback for titles that have no backdrop.
 */
export const iconUrl = (t: Title): string | null => t.backdrop ?? t.poster ?? null

/** PIC1 slot: the full 480x272 background plate. */
export const backdropUrl = (t: Title): string | null => t.backdrop ?? t.poster ?? null

export const posterUrl = (t: Title): string | null => t.poster ?? t.backdrop ?? null

export const logoUrl = (t: Title): string | null => t.logo ?? null

/**
 * Opens a URL in a new tab.
 *
 * A synthetic anchor click rather than window.open: browsers treat window.open
 * from a keyboard handler as a popup and block it (verified — it returns null),
 * while a target=_blank anchor click is a normal navigation and goes through.
 */
export function openInNewTab(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
