/**
 * electron-store/conf re-reads and re-parses the ENTIRE backing JSON file
 * from disk on every `.get()` call, with no caching of its own — confirmed by
 * reading `conf`'s `get store()` implementation (node_modules/conf). On a
 * library with 1000+ tracked files, the launch path calling into this module
 * 7+ times meant 7+ synchronous full-file reads blocking the main process.
 * state-store.ts now mirrors the whole store in memory (one real read per
 * process lifetime, kept in sync on every write). These tests verify that
 * mirror is both correct (no stale reads after a write) and effective (no
 * repeat reads of the backing store on repeated getter calls).
 *
 * `electron-store` itself does `require('electron')` internally — a real
 * CJS require inside a pre-built package that Vitest's `vi.mock` can't
 * intercept (unlike an ESM import in a transformed source file), and no
 * Electron binary is installed in this dev sandbox. Mocking `electron-store`
 * directly sidesteps that whole chain and lets the fake's `.store` getter
 * double as the read-count probe state-store.ts's memoization is meant to
 * minimize calls to.
 */

import { describe, expect, it, vi } from 'vitest';

const { fakeState } = vi.hoisted(() => ({
  fakeState: { data: {} as Record<string, unknown>, storeReads: 0 },
}));

vi.mock('electron-store', () => {
  class FakeStore {
    constructor(_opts: unknown) {}
    get store() {
      fakeState.storeReads++;
      return { ...fakeState.data };
    }
    set(key: string, value: unknown): void {
      fakeState.data[key] = value;
    }
  }
  return { default: FakeStore };
});

const {
  getSettings,
  updateSettings,
  getFileState,
  getFileStates,
  saveFileState,
  getRecentFiles,
  getLibraryCache,
  setLibraryCache,
} = await import('../../src/main/state-store.js');

describe('state-store', () => {
  it('round-trips settings updates', () => {
    updateSettings({ brightness: 42 });
    expect(getSettings().brightness).toBe(42);
  });

  it('round-trips per-file state', () => {
    saveFileState({
      filePath: '/a/book.pdf',
      lastPage: 5,
      readingDirection: 'ltr',
      zoomPreset: 'fit-width',
    });
    expect(getFileState('/a/book.pdf')?.lastPage).toBe(5);
    expect(getFileStates()['/a/book.pdf']?.lastPage).toBe(5);
  });

  it('reflects a library-cache write immediately (in-memory mirror, not stale)', () => {
    setLibraryCache('/root', [{ folder: 'x', items: [] }]);
    expect(getLibraryCache()?.rootFolder).toBe('/root');
  });

  it('does not re-read the backing store on repeated getter calls', () => {
    getSettings(); // ensure the mirror is warm before counting
    const before = fakeState.storeReads;

    getSettings();
    getFileStates();
    getRecentFiles();
    getLibraryCache();

    expect(fakeState.storeReads).toBe(before);
  });

  it('does not force a re-read after a write either', () => {
    getSettings();
    const before = fakeState.storeReads;

    updateSettings({ brightness: 77 });
    expect(getSettings().brightness).toBe(77);

    expect(fakeState.storeReads).toBe(before);
  });
});
