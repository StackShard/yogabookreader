/**
 * Window placement heuristic (PRD §Screen Topology, US#26, Testing §"Window
 * placement heuristic").
 *
 * The reading surface is two screens only when the Yoga Book is held as a book:
 * both panels are then **portrait** and sit **side by side**. In laptop/stacked
 * posture the same panels report **landscape** bounds (or share an x), so the app
 * should read in single-page mode until the user rotates into book posture.
 *
 * Keying off orientation (height > width) instead of an exact pixel size makes
 * this robust to Windows DPI scaling, which reports scaled (not native) bounds.
 * Inputs are minimal display objects so they are trivial to mock and unit-test.
 */

/** The native portrait resolution of one Yoga Book screen (reference only). */
export const READING_WIDTH = 1800;
export const READING_HEIGHT = 2880;

/** Minimal, mock-friendly view of a display. */
export interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export type Placement =
  | { mode: 'dual'; left: DisplayInfo; right: DisplayInfo }
  | { mode: 'single'; display: DisplayInfo }
  | { mode: 'ambiguous'; candidates: DisplayInfo[] };

/** True when a display is portrait — the orientation of a Yoga Book panel in book posture. */
export function isReadingDisplay(d: DisplayInfo): boolean {
  return d.bounds.height > d.bounds.width;
}

/** True when a display is landscape (wider than tall) — wide enough for a
 *  side-by-side two-page spread in a single window. */
export function isLandscape(d: DisplayInfo): boolean {
  return d.bounds.width > d.bounds.height;
}

/** True when the placement is a single display in landscape orientation — the
 *  only case where the side-by-side "two-up" spread option applies. */
export function isSingleLandscape(placement: Placement): boolean {
  return placement.mode === 'single' && isLandscape(placement.display);
}

/** The topmost-then-leftmost display, used as the single-mode screen. */
function primaryOf(displays: DisplayInfo[]): DisplayInfo {
  return [...displays].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)[0];
}

/**
 * Assign displays to reading windows.
 *
 * - Two or more **portrait** displays placed **side by side** (distinct x) →
 *   `dual` (smaller x is the left). This is book posture.
 * - Otherwise → `single`: one display, portrait panels that are stacked (same x),
 *   or landscape/laptop posture. The primary (topmost-leftmost) display is used.
 * - No displays at all → `ambiguous` (effectively never on real hardware).
 */
export function assignDisplays(displays: DisplayInfo[]): Placement {
  if (displays.length === 0) {
    return { mode: 'ambiguous', candidates: [] };
  }

  const portrait = displays.filter(isReadingDisplay);
  if (portrait.length >= 2) {
    const sorted = [...portrait].sort((a, b) => a.bounds.x - b.bounds.x);
    const left = sorted[0];
    const right = sorted[sorted.length - 1];
    if (left.bounds.x !== right.bounds.x) {
      return { mode: 'dual', left, right };
    }
    // Portrait but stacked (same x): not book posture — read single-page.
    return { mode: 'single', display: primaryOf(portrait) };
  }

  return { mode: 'single', display: primaryOf(displays) };
}
