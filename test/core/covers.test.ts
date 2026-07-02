import { describe, expect, it } from 'vitest';
import { matchCachedCovers } from '../../src/core/covers.js';

const thumbnailFileName = (filePath: string): string => `${filePath}.jpg`;

describe('matchCachedCovers', () => {
  it('returns only the paths whose thumbnail file name is cached', () => {
    const hits = matchCachedCovers(
      ['/a/1.pdf', '/a/2.pdf', '/a/3.pdf'],
      new Set(['/a/1.pdf.jpg', '/a/3.pdf.jpg']),
      thumbnailFileName,
    );
    expect(hits).toEqual(
      new Map([
        ['/a/1.pdf', '/a/1.pdf.jpg'],
        ['/a/3.pdf', '/a/3.pdf.jpg'],
      ]),
    );
  });

  it('returns an empty map when nothing is cached', () => {
    const hits = matchCachedCovers(['/a/1.pdf'], new Set(), thumbnailFileName);
    expect(hits.size).toBe(0);
  });

  it('returns an empty map for an empty input list', () => {
    const hits = matchCachedCovers([], new Set(['/a/1.pdf.jpg']), thumbnailFileName);
    expect(hits.size).toBe(0);
  });

  it('handles duplicate file paths without error', () => {
    const hits = matchCachedCovers(
      ['/a/1.pdf', '/a/1.pdf'],
      new Set(['/a/1.pdf.jpg']),
      thumbnailFileName,
    );
    expect(hits.size).toBe(1);
  });
});
