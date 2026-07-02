import { describe, it, expect } from 'vitest';
import { buildSpreads, pagesInSpread } from '../../src/core/spread.js';
import type { AspectClass, DocumentModel, ReadingDirection } from '../../src/core/types.js';

function doc(
  totalPages: number,
  readingDirection: ReadingDirection,
  opts: { aspects?: AspectClass[]; isSpreadEncoded?: boolean; spreadBreaks?: number[] } = {},
): DocumentModel {
  return {
    totalPages,
    readingDirection,
    pageAspects: opts.aspects ?? Array(totalPages).fill('single'),
    isSpreadEncoded: opts.isSpreadEncoded ?? false,
    spreadBreaks: opts.spreadBreaks,
  };
}

describe('buildSpreads — single display mode (folded device)', () => {
  it('shows every page alone on the one screen', () => {
    const spreads = buildSpreads(doc(3, 'ltr'), 'single');
    expect(spreads).toEqual([
      { left: { pageIndex: 0 }, right: null },
      { left: { pageIndex: 1 }, right: null },
      { left: { pageIndex: 2 }, right: null },
    ]);
  });

  it('ignores reading direction for the single screen sequence', () => {
    expect(buildSpreads(doc(2, 'rtl'), 'single')).toEqual(
      buildSpreads(doc(2, 'ltr'), 'single'),
    );
  });
});

describe('buildSpreads — single-twoup mode (one landscape screen)', () => {
  it('produces the exact same paired layout as dual (differs only in window count)', () => {
    for (const dir of ['ltr', 'rtl'] as const) {
      expect(buildSpreads(doc(5, dir), 'single-twoup')).toEqual(
        buildSpreads(doc(5, dir), 'dual'),
      );
    }
  });

  it('honors centerfolds and spread-encoding like dual, not the single fallback', () => {
    const aspects: AspectClass[] = ['single', 'double-spread', 'single', 'single'];
    expect(buildSpreads(doc(4, 'ltr', { aspects }), 'single-twoup')).toEqual(
      buildSpreads(doc(4, 'ltr', { aspects }), 'dual'),
    );
    // ...and is NOT the one-page-per-spread single layout.
    expect(buildSpreads(doc(4, 'ltr', { aspects }), 'single-twoup')).not.toEqual(
      buildSpreads(doc(4, 'ltr', { aspects }), 'single'),
    );
  });
});

describe('buildSpreads — LTR cover-first pairing', () => {
  it('puts the cover alone on the right, then pairs lower-left/higher-right', () => {
    const spreads = buildSpreads(doc(5, 'ltr'), 'dual');
    expect(spreads).toEqual([
      { left: null, right: { pageIndex: 0 } }, // cover
      { left: { pageIndex: 1 }, right: { pageIndex: 2 } },
      { left: { pageIndex: 3 }, right: { pageIndex: 4 } },
    ]);
  });

  it('leaves the trailing odd page alone on the left', () => {
    const spreads = buildSpreads(doc(4, 'ltr'), 'dual');
    expect(spreads).toEqual([
      { left: null, right: { pageIndex: 0 } },
      { left: { pageIndex: 1 }, right: { pageIndex: 2 } },
      { left: { pageIndex: 3 }, right: null },
    ]);
  });

  it('handles a single-page document as just the cover', () => {
    expect(buildSpreads(doc(1, 'ltr'), 'dual')).toEqual([
      { left: null, right: { pageIndex: 0 } },
    ]);
  });
});

describe('buildSpreads — RTL cover-first pairing (manga)', () => {
  it('puts the cover alone on the left, then pairs lower-right/higher-left', () => {
    const spreads = buildSpreads(doc(5, 'rtl'), 'dual');
    expect(spreads).toEqual([
      { left: { pageIndex: 0 }, right: null }, // cover
      { left: { pageIndex: 2 }, right: { pageIndex: 1 } },
      { left: { pageIndex: 4 }, right: { pageIndex: 3 } },
    ]);
  });

  it('leaves the trailing odd page alone on the right', () => {
    const spreads = buildSpreads(doc(4, 'rtl'), 'dual');
    expect(spreads[spreads.length - 1]).toEqual({
      left: null,
      right: { pageIndex: 3 },
    });
  });
});

describe('buildSpreads — centerfolds (double-spread)', () => {
  it('gives a wide page its own spread cropped across both screens', () => {
    // pages: cover(0) single, 1 single, 2 double-spread, 3 single
    const aspects: AspectClass[] = ['single', 'single', 'double-spread', 'single'];
    const spreads = buildSpreads(doc(4, 'ltr', { aspects }), 'dual');
    expect(spreads).toEqual([
      { left: null, right: { pageIndex: 0 } }, // cover
      { left: { pageIndex: 1 }, right: null }, // 1 cannot pair with wide 2
      { left: { pageIndex: 2, half: 'left' }, right: { pageIndex: 2, half: 'right' } },
      { left: { pageIndex: 3 }, right: null },
    ]);
  });

  it('crops the same way regardless of reading direction (image halves are physical)', () => {
    const aspects: AspectClass[] = ['single', 'double-spread'];
    const ltr = buildSpreads(doc(2, 'ltr', { aspects }), 'dual');
    const rtl = buildSpreads(doc(2, 'rtl', { aspects }), 'dual');
    const ltrWide = ltr[ltr.length - 1];
    const rtlWide = rtl[rtl.length - 1];
    expect(ltrWide).toEqual({
      left: { pageIndex: 1, half: 'left' },
      right: { pageIndex: 1, half: 'right' },
    });
    expect(rtlWide).toEqual(ltrWide);
  });
});

describe('buildSpreads — spread-encoded documents', () => {
  it('skips cover-first and spans every wide source page across both screens', () => {
    const aspects: AspectClass[] = ['spread-encoded', 'spread-encoded', 'spread-encoded'];
    const spreads = buildSpreads(
      doc(3, 'ltr', { aspects, isSpreadEncoded: true }),
      'dual',
    );
    expect(spreads).toEqual([
      { left: { pageIndex: 0, half: 'left' }, right: { pageIndex: 0, half: 'right' } },
      { left: { pageIndex: 1, half: 'left' }, right: { pageIndex: 1, half: 'right' } },
      { left: { pageIndex: 2, half: 'left' }, right: { pageIndex: 2, half: 'right' } },
    ]);
  });

  it('shows a narrow cover alone before the spread-encoded pages', () => {
    const aspects: AspectClass[] = ['single', 'spread-encoded', 'spread-encoded'];
    const spreads = buildSpreads(
      doc(3, 'ltr', { aspects, isSpreadEncoded: true }),
      'dual',
    );
    expect(spreads[0]).toEqual({ left: { pageIndex: 0 }, right: null });
    expect(spreads[1]).toEqual({
      left: { pageIndex: 1, half: 'left' },
      right: { pageIndex: 1, half: 'right' },
    });
  });
});

describe('buildSpreads — edge cases', () => {
  it('returns no spreads for an empty document', () => {
    expect(buildSpreads(doc(0, 'ltr'), 'dual')).toEqual([]);
    expect(buildSpreads(doc(0, 'ltr'), 'single')).toEqual([]);
  });
});

describe('buildSpreads — phase nudges (spreadBreaks)', () => {
  it('no breaks pairs normally', () => {
    expect(buildSpreads(doc(6, 'ltr', { spreadBreaks: [] }), 'dual')).toEqual(
      buildSpreads(doc(6, 'ltr'), 'dual'),
    );
  });

  it('a break makes that page lone and re-pairs everything after it', () => {
    // Page index 3 was the start of (3,4); nudging it shifts the pairing by one.
    expect(buildSpreads(doc(6, 'ltr', { spreadBreaks: [3] }), 'dual')).toEqual([
      { left: null, right: { pageIndex: 0 } }, // cover
      { left: { pageIndex: 1 }, right: { pageIndex: 2 } },
      { left: { pageIndex: 3 }, right: null }, // forced lone (the nudge)
      { left: { pageIndex: 4 }, right: { pageIndex: 5 } }, // re-aligned
    ]);
  });

  it('a break on a high page forces its partner to stand alone too', () => {
    // Break at 2 means 1 can no longer pair with 2; both become lone, then 3,4 pair.
    expect(buildSpreads(doc(6, 'ltr', { spreadBreaks: [2] }), 'dual')).toEqual([
      { left: null, right: { pageIndex: 0 } },
      { left: { pageIndex: 1 }, right: null },
      { left: { pageIndex: 2 }, right: null },
      { left: { pageIndex: 3 }, right: { pageIndex: 4 } },
      { left: { pageIndex: 5 }, right: null },
    ]);
  });

  it('RTL puts the lone nudged page on the right', () => {
    expect(buildSpreads(doc(6, 'rtl', { spreadBreaks: [3] }), 'dual')).toEqual([
      { left: { pageIndex: 0 }, right: null }, // cover (RTL)
      { left: { pageIndex: 2 }, right: { pageIndex: 1 } },
      { left: null, right: { pageIndex: 3 } }, // forced lone (RTL side)
      { left: { pageIndex: 5 }, right: { pageIndex: 4 } },
    ]);
  });

  it('never drops or duplicates a page when nudged', () => {
    const seen = buildSpreads(doc(7, 'ltr', { spreadBreaks: [3, 5] }), 'dual')
      .flatMap(pagesInSpread)
      .sort((a, b) => a - b);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('pagesInSpread', () => {
  it('lists referenced pages ascending and dedupes spanning halves', () => {
    expect(pagesInSpread({ left: { pageIndex: 3 }, right: { pageIndex: 1 } })).toEqual([1, 3]);
    expect(
      pagesInSpread({
        left: { pageIndex: 2, half: 'left' },
        right: { pageIndex: 2, half: 'right' },
      }),
    ).toEqual([2]);
    expect(pagesInSpread({ left: null, right: null })).toEqual([]);
  });
});
