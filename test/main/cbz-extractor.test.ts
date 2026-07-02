/**
 * Pure entry-ordering / page-naming logic of the comic extractor. The archive
 * I/O itself needs real files and is exercised on hardware; these cover the
 * mapping that used to lose pages when sub-folders shared basenames.
 */

import { describe, expect, it } from 'vitest';
import { orderImageEntries, pageFileName } from '../../src/main/cbz-extractor.js';

describe('orderImageEntries', () => {
  it('keeps only image entries', () => {
    expect(orderImageEntries(['a.jpg', 'notes.txt', 'b.png', 'thumbs.db'])).toEqual([
      'a.jpg',
      'b.png',
    ]);
  });

  it('sorts naturally so page2 precedes page10', () => {
    expect(orderImageEntries(['page10.jpg', 'page2.jpg', 'page1.jpg'])).toEqual([
      'page1.jpg',
      'page2.jpg',
      'page10.jpg',
    ]);
  });

  it('orders by full path, keeping chapters grouped', () => {
    expect(
      orderImageEntries(['ch2/01.jpg', 'ch1/02.jpg', 'ch1/01.jpg', 'ch10/01.jpg']),
    ).toEqual(['ch1/01.jpg', 'ch1/02.jpg', 'ch2/01.jpg', 'ch10/01.jpg']);
  });
});

describe('pageFileName', () => {
  it('is unique across sub-folders sharing a basename', () => {
    const names = ['ch1/01.jpg', 'ch2/01.jpg'].map((n, i) => pageFileName(i, n));
    expect(new Set(names).size).toBe(2);
  });

  it('preserves reading order under natural sort of the output names', () => {
    const ordered = orderImageEntries(['ch2/01.jpg', 'ch1/02.jpg', 'ch1/01.jpg']);
    const onDisk = ordered.map((n, i) => pageFileName(i, n));
    const resorted = [...onDisk].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
    expect(resorted).toEqual(onDisk);
  });

  it('flattens backslash separators from RAR entry names', () => {
    expect(pageFileName(3, 'ch1\\01.jpg')).toBe('00003_01.jpg');
  });
});
