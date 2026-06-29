import { describe, it, expect } from 'vitest';
import {
  pageRatio,
  isWidePage,
  detectSpreadEncoding,
  classifyDocument,
  provisionalClassification,
  WIDE_THRESHOLD,
  type PageDimensions,
} from '../../src/core/aspect.js';

const single: PageDimensions = { width: 1000, height: 1600 }; // 10:16
const spread: PageDimensions = { width: 2000, height: 1600 }; // 20:16

describe('pageRatio', () => {
  it('computes width/height', () => {
    expect(pageRatio(single)).toBeCloseTo(0.625);
    expect(pageRatio(spread)).toBeCloseTo(1.25);
  });

  it('returns 0 for degenerate dimensions', () => {
    expect(pageRatio({ width: 0, height: 1600 })).toBe(0);
    expect(pageRatio({ width: 1000, height: 0 })).toBe(0);
  });
});

describe('isWidePage', () => {
  it('classifies single vs spread relative to the threshold', () => {
    expect(isWidePage(single)).toBe(false);
    expect(isWidePage(spread)).toBe(true);
  });

  it('treats a page exactly at the threshold as wide', () => {
    const atThreshold: PageDimensions = { width: WIDE_THRESHOLD * 1600, height: 1600 };
    expect(isWidePage(atThreshold)).toBe(true);
  });
});

describe('detectSpreadEncoding', () => {
  it('is false for an empty document', () => {
    expect(detectSpreadEncoding([])).toBe(false);
  });

  it('is false for a normal portrait document', () => {
    expect(detectSpreadEncoding([single, single, single, single])).toBe(false);
  });

  it('is true when a strong majority of pages are wide', () => {
    expect(detectSpreadEncoding([spread, spread, spread, spread, single])).toBe(true);
  });

  it('is false when only an occasional centerfold is wide', () => {
    expect(detectSpreadEncoding([single, single, spread, single, single])).toBe(false);
  });
});

describe('classifyDocument', () => {
  it('marks occasional wide pages as double-spread in a normal document', () => {
    const { isSpreadEncoded, pageAspects } = classifyDocument([single, spread, single]);
    expect(isSpreadEncoded).toBe(false);
    expect(pageAspects).toEqual(['single', 'double-spread', 'single']);
  });

  it('marks wide pages as spread-encoded in a uniformly-wide document', () => {
    const { isSpreadEncoded, pageAspects } = classifyDocument([spread, spread, spread]);
    expect(isSpreadEncoded).toBe(true);
    expect(pageAspects).toEqual(['spread-encoded', 'spread-encoded', 'spread-encoded']);
  });

  it('keeps a narrow cover as single inside a spread-encoded document', () => {
    const { isSpreadEncoded, pageAspects } = classifyDocument([
      single,
      spread,
      spread,
      spread,
      spread,
    ]);
    expect(isSpreadEncoded).toBe(true);
    expect(pageAspects[0]).toBe('single');
    expect(pageAspects.slice(1)).toEqual([
      'spread-encoded',
      'spread-encoded',
      'spread-encoded',
      'spread-encoded',
    ]);
  });

  it('honours a manual override forcing spread-encoding off', () => {
    const { isSpreadEncoded, pageAspects } = classifyDocument(
      [spread, spread, spread],
      false,
    );
    expect(isSpreadEncoded).toBe(false);
    expect(pageAspects).toEqual(['double-spread', 'double-spread', 'double-spread']);
  });

  it('honours a manual override forcing spread-encoding on', () => {
    const { isSpreadEncoded, pageAspects } = classifyDocument([single, single], true);
    expect(isSpreadEncoded).toBe(true);
    // Narrow pages remain single even when forced on.
    expect(pageAspects).toEqual(['single', 'single']);
  });
});

describe('provisionalClassification', () => {
  it('marks all pages single when no override', () => {
    const result = provisionalClassification(5, undefined);
    expect(result.isSpreadEncoded).toBe(false);
    expect(result.pageAspects).toEqual(['single', 'single', 'single', 'single', 'single']);
  });

  it('marks all pages spread-encoded when override is true', () => {
    const result = provisionalClassification(3, true);
    expect(result.isSpreadEncoded).toBe(true);
    expect(result.pageAspects).toEqual(['spread-encoded', 'spread-encoded', 'spread-encoded']);
  });

  it('marks all pages single when override is false (not spread-encoded)', () => {
    const result = provisionalClassification(2, false);
    expect(result.isSpreadEncoded).toBe(false);
    expect(result.pageAspects).toEqual(['single', 'single']);
  });

  it('handles zero pages', () => {
    const result = provisionalClassification(0, undefined);
    expect(result.isSpreadEncoded).toBe(false);
    expect(result.pageAspects).toEqual([]);
  });
});
