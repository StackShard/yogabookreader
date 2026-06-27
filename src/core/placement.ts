/**
 * Window placement heuristic (PRD §Screen Topology, US#26, Testing §"Window
 * placement heuristic").
 *
 * Windows exposes the Yoga Book's screens as two separate 1800×2880 monitors.
 * Given a list of display objects (shaped like Electron's `Display` but kept
 * minimal so they are trivial to mock), find the two reading displays and assign
 * one to the left window and one to the right. Degenerate cases — a single
 * display (folded device), no matching pair, or two displays we cannot order —
 * are reported so the UI can fall back to single-page mode or tap-to-identify.
 */

/** The native portrait resolution of one Yoga Book screen. */
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

/** True when a display matches a single Yoga Book reading screen. */
export function isReadingDisplay(d: DisplayInfo): boolean {
  return d.bounds.width === READING_WIDTH && d.bounds.height === READING_HEIGHT;
}

/**
 * Assign displays to left/right reading windows.
 *
 * - Two reading displays with distinct x → `dual` (smaller x is the left).
 * - Exactly one usable display → `single` (folded device / one monitor).
 * - Two reading displays we cannot order (identical x) → `ambiguous`, so the app
 *   can show its tap-to-identify fallback.
 * - No reading-sized display → fall back to the available displays as best we
 *   can (single if one, ambiguous if several, ).
 */
export function assignDisplays(displays: DisplayInfo[]): Placement {
  const reading = displays.filter(isReadingDisplay);

  // Prefer the correctly-sized reading displays; otherwise use whatever exists
  // so the app still runs on non-target hardware (e.g. during development).
  const pool = reading.length > 0 ? reading : displays;

  if (pool.length === 0) {
    return { mode: 'ambiguous', candidates: [] };
  }
  if (pool.length === 1) {
    return { mode: 'single', display: pool[0] };
  }

  // Order by horizontal position; the two leftmost/rightmost form the spread.
  const sorted = [...pool].sort((a, b) => a.bounds.x - b.bounds.x);
  const left = sorted[0];
  const right = sorted[sorted.length - 1];

  if (left.bounds.x === right.bounds.x) {
    // Cannot tell them apart by position — let the user identify them.
    return { mode: 'ambiguous', candidates: pool };
  }

  return { mode: 'dual', left, right };
}
