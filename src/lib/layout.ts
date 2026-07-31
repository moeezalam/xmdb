/**
 * XMB geometry, in PSP logical pixels. The whole UI is authored against a
 * 480x272 box and scaled to the viewport by one CSS transform, so every number
 * here is a real PSP-screen pixel.
 *
 * CALIBRATION: to pixel-match a real PSP, run PPSSPP at 1x, screenshot the
 * Game menu, drop it into public/calibration.png and press `C` in the app to
 * overlay it at 50% opacity. Tune these constants until they align, then press
 * `C` again. Nothing else in the codebase hardcodes a coordinate.
 */
export const SCREEN_W = 480
export const SCREEN_H = 272

/*
 * CALIBRATED against a real XMB frame (421x236), measured by scanning the
 * image for bright low-saturation UI pixels and taking the band centres:
 *
 *   item column band  117..130 -> centre 123.5 -> 140.8 in 480px  => CROSS_X
 *   category row band  59..69  -> centre  64.0 ->  73.8 in 272px  => CAT_Y
 *   category centres (480-space): 88, 140, 202, 245, 297, 347, 396, 451
 *                                 mean gap 51.9                   => CAT_SPACING
 *   category icon bright core 11px of 236 -> ~13 in 272; the anti-aliased
 *   glyph is wider, and ours are stroked rather than solid, so 28 keeps the
 *   measured proportion legible.
 *
 * The reference frame is a PS3 XMB, not a PSP: the cross geometry is shared,
 * but a PSP Game column carries 144x80 ICON0 art rather than 24px glyphs, so
 * ITEM_SPACING and the tile sizes below are driven by that art, not by the
 * reference. Drop a PSP capture in public/calibration.png and press C to
 * overlay it and finish the job.
 */
export const CROSS_X = 140
/** Centre y of the category icon row. */
export const CAT_Y = 74
/** Horizontal gap between category icons. */
export const CAT_SPACING = 52
export const CAT_ICON_SEL = 28
export const CAT_ICON_UNSEL = 20
/** Category icons further than this from the cross point are not rendered. */
export const CAT_WINDOW = 5

/**
 * Centre y of the selected column item. The column slides; this stays put.
 * The reference puts it at 117; ours sits slightly lower because a 62px-tall
 * artwork tile needs to clear the category row, which a 24px glyph does not.
 */
export const SEL_Y = 128
/**
 * Vertical gap between column items. Must exceed
 * (ICON_SEL_H + ICON_UNSEL_H) / 2 or the neighbouring row disappears behind
 * the selected tile instead of sitting above it.
 */
export const ITEM_SPACING = 42
/** Column items further than this from the selection are not rendered. */
export const ITEM_WINDOW = 6

/** ICON0 box for the selected row. PSP ships ICON0.PNG at 144x80; this is that, scaled. */
export const ICON_SEL_W = 112
export const ICON_SEL_H = 62
/** ICON0 box for every other row. */
export const ICON_UNSEL_W = 54
export const ICON_UNSEL_H = 30
/** Left edge of the selected icon box; unselected boxes centre on the same axis. */
export const ICON_LEFT = CROSS_X - ICON_SEL_W / 2

/** Text column, to the right of the icon. Reference gap is ~23 in 480-space. */
export const TEXT_X = ICON_LEFT + ICON_SEL_W + 16
/** Right-hand info plate (PSP's PIC0 slot). */
export const PANEL_X = TEXT_X
export const PANEL_W = SCREEN_W - PANEL_X - 14

/** Animation time constant, seconds. Lower = snappier. */
export const TAU = 0.075
/** Key-repeat: delay before the first repeat, then the accelerating interval floor. */
export const REPEAT_DELAY = 380
export const REPEAT_FAST = 55
export const REPEAT_ACCEL = 0.72
/**
 * How long the selection must hold still before the trailer is allowed to
 * start. Long enough to read the card and look at the artwork — the tile is
 * the point, and motion arriving instantly steps on it. The player then takes
 * a further beat to load and report PLAYING before it fades in, so the still
 * is on screen for roughly three seconds in practice.
 */
export const TRAILER_DWELL = 2000

/** Falloff for the opacity ramp away from the cross point. */
export const FALLOFF = 0.55

/** How far the cross slides left when a sub-column (genre, director) opens. */
export const DEPTH_SHIFT = 58
/**
 * Items above this y fade out. The artwork tile is far taller than the
 * reference's glyph, so the row above the selection would sit on top of the
 * category bar; the reference frame shows the same thing, with the column
 * running downward from the cross and nothing stacked above it.
 */
export const TOP_FADE_FROM = CAT_Y + 16
export const TOP_FADE_TO = CAT_Y + 42
/** …and the same at the bottom, so the list dissolves instead of being cut off. */
export const BOTTOM_FADE_FROM = SCREEN_H + 4
export const BOTTOM_FADE_TO = SCREEN_H - 40
