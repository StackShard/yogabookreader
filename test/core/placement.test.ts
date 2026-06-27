import { describe, it, expect } from 'vitest';
import {
  assignDisplays,
  isReadingDisplay,
  READING_WIDTH,
  READING_HEIGHT,
  type DisplayInfo,
} from '../../src/core/placement.js';

function display(id: number, x: number, w = READING_WIDTH, h = READING_HEIGHT): DisplayInfo {
  return { id, bounds: { x, y: 0, width: w, height: h } };
}

describe('isReadingDisplay', () => {
  it('matches the native 1800x2880 portrait resolution', () => {
    expect(isReadingDisplay(display(1, 0))).toBe(true);
    expect(isReadingDisplay({ id: 2, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })).toBe(
      false,
    );
  });
});

describe('assignDisplays', () => {
  it('assigns the two reading displays left/right by x position', () => {
    const result = assignDisplays([display(2, 1800), display(1, 0)]);
    expect(result.mode).toBe('dual');
    if (result.mode === 'dual') {
      expect(result.left.id).toBe(1);
      expect(result.right.id).toBe(2);
    }
  });

  it('falls back to single-page mode with one display (folded device)', () => {
    const result = assignDisplays([display(1, 0)]);
    expect(result.mode).toBe('single');
    if (result.mode === 'single') expect(result.display.id).toBe(1);
  });

  it('reports ambiguous when two displays share the same x', () => {
    const result = assignDisplays([display(1, 0), display(2, 0)]);
    expect(result.mode).toBe('ambiguous');
  });

  it('ignores non-reading displays when a reading pair exists', () => {
    const extraneous: DisplayInfo = { id: 9, bounds: { x: 5000, y: 0, width: 1920, height: 1080 } };
    const result = assignDisplays([extraneous, display(2, 1800), display(1, 0)]);
    expect(result.mode).toBe('dual');
    if (result.mode === 'dual') {
      expect(result.left.id).toBe(1);
      expect(result.right.id).toBe(2);
    }
  });

  it('falls back to available displays when none match the reading size', () => {
    const a: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
    const b: DisplayInfo = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } };
    const result = assignDisplays([a, b]);
    expect(result.mode).toBe('dual');
    if (result.mode === 'dual') {
      expect(result.left.id).toBe(1);
      expect(result.right.id).toBe(2);
    }
  });

  it('reports ambiguous when there are no displays at all', () => {
    expect(assignDisplays([]).mode).toBe('ambiguous');
  });
});
