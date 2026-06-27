/**
 * Navigation state machine (PRD §Touch Navigation, US#3/#4/#16, Testing §2).
 *
 * Navigation operates on a spread-index model: the list produced by
 * {@link buildSpreads}. "Next" and "previous" move between whole spreads and
 * clamp at the boundaries (the cover spread and the last spread). Jump-to-page
 * and resume-on-reopen map a page index back to the spread that shows it.
 */

import type { SpreadLayout } from './types.js';
import { pagesInSpread } from './spread.js';

/** Clamp a spread index into the valid range for `count` spreads. */
export function clampSpreadIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return index;
}

/** Move to the next spread, stopping at the last one. */
export function nextSpreadIndex(current: number, count: number): number {
  return clampSpreadIndex(current + 1, count);
}

/** Move to the previous spread, stopping at the cover. */
export function prevSpreadIndex(current: number, count: number): number {
  return clampSpreadIndex(current - 1, count);
}

/** True when there is no earlier spread. */
export function isFirstSpread(current: number): boolean {
  return current <= 0;
}

/** True when there is no later spread. */
export function isLastSpread(current: number, count: number): boolean {
  return current >= count - 1;
}

/**
 * Find the spread that contains a given page index (used for go-to-page and for
 * resume-on-reopen). Returns the first spread referencing the page; if the page
 * is not found (e.g. out-of-range stored state), clamps to a valid spread.
 */
export function findSpreadIndexForPage(
  spreads: SpreadLayout[],
  pageIndex: number,
): number {
  for (let i = 0; i < spreads.length; i++) {
    if (pagesInSpread(spreads[i]).includes(pageIndex)) return i;
  }
  // Page not directly present: clamp toward the nearest valid spread so a stale
  // or out-of-range lastPage still resumes somewhere sensible.
  return clampSpreadIndex(pageIndex, spreads.length);
}

/**
 * The page index to persist as `lastPage` for a spread. Uses the lowest page in
 * the spread so that resuming re-derives the same spread regardless of reading
 * direction.
 */
export function anchorPageOfSpread(spread: SpreadLayout): number {
  const pages = pagesInSpread(spread);
  return pages.length > 0 ? pages[0] : 0;
}
