import { describe, it, expect } from 'vitest';
import {
  assignDisplays,
  isReadingDisplay,
  READING_WIDTH,
  READING_HEIGHT,
  type DisplayInfo,
} from '../../src/core/placement.js';

/** A portrait (book-posture) panel at horizontal offset x. */
function portrait(id: number, x: number, y = 0): DisplayInfo {
  return { id, bounds: { x, y, width: READING_WIDTH, height: READING_HEIGHT } };
}

/** A landscape (laptop-posture) panel. */
function landscape(id: number, x: number, y = 0): DisplayInfo {
  return { id, bounds: { x, y, width: READING_HEIGHT, height: READING_WIDTH } };
}

describe('isReadingDisplay', () => {
  it('treats portrait displays as reading panels and landscape as not', () => {
    expect(isReadingDisplay(portrait(1, 0))).toBe(true);
    expect(isReadingDisplay(landscape(2, 0))).toBe(false);
  });
});

describe('assignDisplays — book posture (two portrait panels side by side)', () => {
  it('assigns left/right by x position', () => {
    const result = assignDisplays([portrait(2, 1800), portrait(1, 0)]);
    expect(result.mode).toBe('dual');
    if (result.mode === 'dual') {
      expect(result.left.id).toBe(1);
      expect(result.right.id).toBe(2);
    }
  });

  it('ignores a non-reading (landscape) display when a portrait pair exists', () => {
    const result = assignDisplays([landscape(9, 5000), portrait(2, 1800), portrait(1, 0)]);
    expect(result.mode).toBe('dual');
    if (result.mode === 'dual') {
      expect(result.left.id).toBe(1);
      expect(result.right.id).toBe(2);
    }
  });
});

describe('assignDisplays — single-page fallbacks', () => {
  it('one display → single', () => {
    const result = assignDisplays([portrait(1, 0)]);
    expect(result.mode).toBe('single');
    if (result.mode === 'single') expect(result.display.id).toBe(1);
  });

  it('two portrait panels stacked (same x) → single, topmost chosen', () => {
    const result = assignDisplays([portrait(1, 0, 2880), portrait(2, 0, 0)]);
    expect(result.mode).toBe('single');
    if (result.mode === 'single') expect(result.display.id).toBe(2); // smaller y
  });

  it('two landscape panels (laptop posture) → single', () => {
    const result = assignDisplays([landscape(1, 0), landscape(2, 0, 1800)]);
    expect(result.mode).toBe('single');
  });

  it('picks the topmost-then-leftmost primary among landscape displays', () => {
    const result = assignDisplays([landscape(2, 100, 0), landscape(1, 0, 0)]);
    expect(result.mode).toBe('single');
    if (result.mode === 'single') expect(result.display.id).toBe(1);
  });
});

describe('assignDisplays — degenerate', () => {
  it('no displays → ambiguous', () => {
    expect(assignDisplays([]).mode).toBe('ambiguous');
  });
});
