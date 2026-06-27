/**
 * Aspect-ratio classification (PRD §Spread Logic, US#20/#21/#22).
 *
 * A single physical Yoga Book page is ~10:16 portrait (width/height ≈ 0.625).
 * A two-physical-page spread is ~20:16 (width/height ≈ 1.25). We classify each
 * page as narrow ("single") or wide, then decide at the document level whether
 * the wide pages mean an occasional centerfold ("double-spread") or that the
 * whole document is pre-spread-encoded ("spread-encoded").
 */

import type { AspectClass } from './types.js';

/** width/height of a single portrait page (10:16). */
export const SINGLE_RATIO = 10 / 16; // 0.625
/** width/height of a two-page spread (20:16). */
export const SPREAD_RATIO = 20 / 16; // 1.25
/**
 * Decision boundary between narrow and wide pages: the midpoint between the
 * single and spread ratios. A page wider than this is treated as a two-page-wide
 * page.
 */
export const WIDE_THRESHOLD = (SINGLE_RATIO + SPREAD_RATIO) / 2; // 0.9375

/**
 * Fraction of pages that must be wide for the whole document to be considered
 * spread-encoded (each source page is a scan of two physical pages). Below this,
 * wide pages are treated as occasional centerfolds.
 */
export const SPREAD_ENCODED_MAJORITY = 0.8;

export interface PageDimensions {
  width: number;
  height: number;
}

/** Aspect ratio (width / height) of a page; 0 for degenerate dimensions. */
export function pageRatio(dim: PageDimensions): number {
  if (dim.height <= 0 || dim.width <= 0) return 0;
  return dim.width / dim.height;
}

/** True when a page is wide enough to represent two physical pages. */
export function isWidePage(dim: PageDimensions): boolean {
  return pageRatio(dim) >= WIDE_THRESHOLD;
}

/**
 * Decide whether a document is spread-encoded from its page dimensions.
 * True when a strong majority of pages are wide (so splitting is the norm, not
 * the exception). Empty documents are not spread-encoded.
 */
export function detectSpreadEncoding(dims: PageDimensions[]): boolean {
  if (dims.length === 0) return false;
  const wideCount = dims.filter(isWidePage).length;
  return wideCount / dims.length >= SPREAD_ENCODED_MAJORITY;
}

/**
 * Classify every page of a document.
 *
 * `override` corresponds to {@link PerFileState.isSpreadEncoded}: when defined it
 * forces the spread-encoded decision (PRD US#22 manual override). When omitted,
 * detection is automatic.
 *
 * Returns the effective spread-encoded flag plus a per-page class array:
 * - spread-encoded document  -> every wide page is `spread-encoded`; any narrow
 *   page stays `single` (e.g. a non-spread cover scan).
 * - normal document          -> wide pages are `double-spread`, others `single`.
 */
export function classifyDocument(
  dims: PageDimensions[],
  override?: boolean,
): { isSpreadEncoded: boolean; pageAspects: AspectClass[] } {
  const isSpreadEncoded = override ?? detectSpreadEncoding(dims);
  const pageAspects: AspectClass[] = dims.map((dim) => {
    const wide = isWidePage(dim);
    if (!wide) return 'single';
    return isSpreadEncoded ? 'spread-encoded' : 'double-spread';
  });
  return { isSpreadEncoded, pageAspects };
}
