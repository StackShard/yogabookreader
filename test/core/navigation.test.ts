import { describe, it, expect } from 'vitest';
import {
  clampSpreadIndex,
  nextSpreadIndex,
  prevSpreadIndex,
  isFirstSpread,
  isLastSpread,
  findSpreadIndexForPage,
  anchorPageOfSpread,
} from '../../src/core/navigation.js';
import { buildSpreads } from '../../src/core/spread.js';
import type { DocumentModel } from '../../src/core/types.js';

const ltrDoc: DocumentModel = {
  totalPages: 5,
  readingDirection: 'ltr',
  pageAspects: Array(5).fill('single'),
  isSpreadEncoded: false,
};
// Spreads: [cover 0], [1,2], [3,4]  -> 3 spreads
const spreads = buildSpreads(ltrDoc, 'dual');

describe('clampSpreadIndex', () => {
  it('clamps below, above, and within range', () => {
    expect(clampSpreadIndex(-3, 3)).toBe(0);
    expect(clampSpreadIndex(9, 3)).toBe(2);
    expect(clampSpreadIndex(1, 3)).toBe(1);
  });

  it('returns 0 for an empty document', () => {
    expect(clampSpreadIndex(2, 0)).toBe(0);
  });
});

describe('next/prev at boundaries', () => {
  it('advances and stops at the last spread', () => {
    expect(nextSpreadIndex(0, 3)).toBe(1);
    expect(nextSpreadIndex(1, 3)).toBe(2);
    expect(nextSpreadIndex(2, 3)).toBe(2); // clamps at end
  });

  it('goes back and stops at the cover', () => {
    expect(prevSpreadIndex(2, 3)).toBe(1);
    expect(prevSpreadIndex(1, 3)).toBe(0);
    expect(prevSpreadIndex(0, 3)).toBe(0); // clamps at cover
  });

  it('reports first/last correctly', () => {
    expect(isFirstSpread(0)).toBe(true);
    expect(isFirstSpread(1)).toBe(false);
    expect(isLastSpread(2, 3)).toBe(true);
    expect(isLastSpread(1, 3)).toBe(false);
  });
});

describe('cover -> first spread transition', () => {
  it('moves from the cover to the first paired spread', () => {
    const afterCover = nextSpreadIndex(0, spreads.length);
    expect(afterCover).toBe(1);
    expect(spreads[afterCover]).toEqual({
      left: { pageIndex: 1 },
      right: { pageIndex: 2 },
    });
  });
});

describe('findSpreadIndexForPage (go-to-page / resume)', () => {
  it('finds the spread holding a given page', () => {
    expect(findSpreadIndexForPage(spreads, 0)).toBe(0); // cover
    expect(findSpreadIndexForPage(spreads, 2)).toBe(1); // in [1,2]
    expect(findSpreadIndexForPage(spreads, 3)).toBe(2); // in [3,4]
  });

  it('clamps a stale/out-of-range page to a valid spread', () => {
    expect(findSpreadIndexForPage(spreads, 99)).toBe(2);
  });
});

describe('anchorPageOfSpread (lastPage to persist)', () => {
  it('uses the lowest page index in the spread', () => {
    expect(anchorPageOfSpread(spreads[0])).toBe(0);
    expect(anchorPageOfSpread(spreads[1])).toBe(1);
    expect(anchorPageOfSpread(spreads[2])).toBe(3);
  });

  it('round-trips: resuming from a persisted anchor returns the same spread', () => {
    for (let i = 0; i < spreads.length; i++) {
      const anchor = anchorPageOfSpread(spreads[i]);
      expect(findSpreadIndexForPage(spreads, anchor)).toBe(i);
    }
  });
});
