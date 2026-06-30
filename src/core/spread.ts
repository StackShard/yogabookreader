/**
 * Spread layout — the heart of the app (PRD §Spread Logic, US#1/#2/#7/#20/#21/#26).
 *
 * Given a document model and the current display mode, produce the ordered list
 * of spreads. Each spread says exactly what the left screen and the right screen
 * render. This is pure data in → data out, so every rule below is unit-tested.
 *
 * Page indices are 0-based. Reading the user-facing rules in 1-based terms:
 *   - Page 1 (the cover) renders alone — right screen for LTR, left for RTL.
 *   - After the cover, pages pair up: (2,3), (4,5), ... For LTR the lower page
 *     number is on the left; for RTL it is on the right.
 *   - A wide page (centerfold or a spread-encoded scan) gets its own spread and
 *     is cropped in half across both screens (left half → left screen).
 *   - In single-display mode every page is its own spread on the one screen.
 */

import type {
  DocumentModel,
  DisplayMode,
  ScreenContent,
  SpreadLayout,
} from './types.js';

/** Cover alone: right screen for LTR, left screen for RTL. */
function coverLayout(doc: DocumentModel, pageIndex: number): SpreadLayout {
  const content: ScreenContent = { pageIndex };
  return doc.readingDirection === 'ltr'
    ? { left: null, right: content }
    : { left: content, right: null };
}

/**
 * A normal two-page spread. `lo` < `hi` by document order.
 * LTR puts the earlier page on the left; RTL puts it on the right.
 */
function pairLayout(
  doc: DocumentModel,
  lo: number,
  hi: number,
): SpreadLayout {
  return doc.readingDirection === 'ltr'
    ? { left: { pageIndex: lo }, right: { pageIndex: hi } }
    : { left: { pageIndex: hi }, right: { pageIndex: lo } };
}

/**
 * A lone page that has no partner (trailing odd page, or its neighbour is wide).
 * It sits on the side an earlier page would occupy, leaving the other blank.
 */
function lonePairLayout(doc: DocumentModel, pageIndex: number): SpreadLayout {
  const content: ScreenContent = { pageIndex };
  return doc.readingDirection === 'ltr'
    ? { left: content, right: null }
    : { left: null, right: content };
}

/**
 * A wide page (centerfold or spread-encoded scan) spanning both screens. The
 * physical left half of the image always goes on the physical left screen — an
 * image's halves do not flip with reading direction.
 */
function spanningLayout(pageIndex: number): SpreadLayout {
  return {
    left: { pageIndex, half: 'left' },
    right: { pageIndex, half: 'right' },
  };
}

/** True for pages that occupy a whole spread on their own. */
function isWideAspect(doc: DocumentModel, i: number): boolean {
  const a = doc.pageAspects[i];
  return a === 'double-spread' || a === 'spread-encoded';
}

/**
 * Build the ordered list of spreads for a document.
 *
 * In `single` display mode (folded Yoga Book, US#26) every page is shown alone
 * on the one available screen; the spanning/cover/pairing rules are bypassed.
 */
export function buildSpreads(
  doc: DocumentModel,
  displayMode: DisplayMode,
): SpreadLayout[] {
  const n = doc.totalPages;
  if (n <= 0) return [];

  if (displayMode === 'single') {
    // One screen: each page is its own spread. The renderer resolves the single
    // window's content as `left ?? right`, so place it on `left` consistently.
    const spreads: SpreadLayout[] = [];
    for (let i = 0; i < n; i++) {
      spreads.push({ left: { pageIndex: i }, right: null });
    }
    return spreads;
  }

  // User phase nudges: pages forced to start a spread alone, re-aligning every
  // pair after them (fixes a skipped/mis-scanned page). See PerFileState.
  const breaks = new Set(doc.spreadBreaks);

  const spreads: SpreadLayout[] = [];
  let i = 0;

  // Cover-first only applies to normal documents. A spread-encoded document has
  // no standalone cover concept — each source page is already a full spread.
  if (!doc.isSpreadEncoded) {
    spreads.push(coverLayout(doc, 0));
    i = 1;
  }

  while (i < n) {
    if (isWideAspect(doc, i)) {
      spreads.push(spanningLayout(i));
      i += 1;
      continue;
    }
    // A phase break makes this page lone (blank opposite screen) and shifts the
    // pairing of everything after it by one — the non-destructive "nudge".
    if (breaks.has(i)) {
      spreads.push(lonePairLayout(doc, i));
      i += 1;
      continue;
    }
    const next = i + 1;
    if (next < n && !isWideAspect(doc, next) && !breaks.has(next)) {
      spreads.push(pairLayout(doc, i, next));
      i += 2;
    } else {
      // Trailing odd page, the next page is wide, or the next page is a forced
      // break that must start its own spread — so this page sits alone.
      spreads.push(lonePairLayout(doc, i));
      i += 1;
    }
  }

  return spreads;
}

/** All page indices referenced by a spread, in ascending order. */
export function pagesInSpread(spread: SpreadLayout): number[] {
  const pages = new Set<number>();
  if (spread.left) pages.add(spread.left.pageIndex);
  if (spread.right) pages.add(spread.right.pageIndex);
  return [...pages].sort((a, b) => a - b);
}
