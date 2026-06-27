import { describe, it, expect } from 'vitest';
import {
  deserialize,
  serialize,
  emptyState,
  normalizeSettings,
  upsertRecentFile,
  MAX_RECENT_FILES,
} from '../../src/core/state.js';
import { DEFAULT_SETTINGS, type PersistedState, type RecentFile } from '../../src/core/types.js';

describe('normalizeSettings', () => {
  it('returns defaults for non-objects', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and rejects invalid enums / ranges', () => {
    const s = normalizeSettings({
      rootFolder: '/books',
      defaultReadingDirection: 'rtl',
      defaultZoomPreset: 'full-bleed',
      tapZoneWidth: 0.3,
      animationsEnabled: true,
      windowedMode: true,
    });
    expect(s.rootFolder).toBe('/books');
    expect(s.defaultReadingDirection).toBe('rtl');
    expect(s.defaultZoomPreset).toBe('full-bleed');
    expect(s.tapZoneWidth).toBe(0.3);
    expect(s.animationsEnabled).toBe(true);
  });

  it('falls back for bad enum and out-of-range tap zone', () => {
    const s = normalizeSettings({
      defaultReadingDirection: 'sideways',
      defaultZoomPreset: 'huge',
      tapZoneWidth: 0.9,
    });
    expect(s.defaultReadingDirection).toBe('ltr');
    expect(s.defaultZoomPreset).toBe('fit-width');
    expect(s.tapZoneWidth).toBe(DEFAULT_SETTINGS.tapZoneWidth);
  });

  it('clamps brightness into 10–100 and defaults when missing/invalid', () => {
    expect(normalizeSettings({ brightness: 50 }).brightness).toBe(50);
    expect(normalizeSettings({ brightness: 5 }).brightness).toBe(10);
    expect(normalizeSettings({ brightness: 500 }).brightness).toBe(100);
    expect(normalizeSettings({ brightness: 'bright' }).brightness).toBe(
      DEFAULT_SETTINGS.brightness,
    );
    expect(normalizeSettings({}).brightness).toBe(DEFAULT_SETTINGS.brightness);
  });

  it('validates edgeDeadZone and the new toggles', () => {
    expect(normalizeSettings({ edgeDeadZone: 0.1 }).edgeDeadZone).toBe(0.1);
    expect(normalizeSettings({ edgeDeadZone: 0.9 }).edgeDeadZone).toBe(
      DEFAULT_SETTINGS.edgeDeadZone,
    );
    expect(normalizeSettings({ disableAdaptiveBrightness: false }).disableAdaptiveBrightness).toBe(
      false,
    );
    expect(normalizeSettings({}).disableAdaptiveBrightness).toBe(true);
    expect(normalizeSettings({ helpShown: true }).helpShown).toBe(true);
    expect(normalizeSettings({}).helpShown).toBe(false);
  });
});

describe('deserialize', () => {
  it('produces an empty, valid state from garbage', () => {
    expect(deserialize(42)).toEqual(emptyState());
    expect(deserialize(null)).toEqual(emptyState());
  });

  it('normalizes per-file states and drops entries without a path', () => {
    const state = deserialize({
      files: {
        '/a.pdf': { filePath: '/a.pdf', lastPage: 12, readingDirection: 'rtl' },
        bogus: { lastPage: 3 }, // no filePath -> dropped
      },
    });
    expect(Object.keys(state.files)).toEqual(['/a.pdf']);
    const a = state.files['/a.pdf'];
    expect(a.lastPage).toBe(12);
    expect(a.readingDirection).toBe('rtl');
    expect(a.zoomPreset).toBe('fit-width'); // default applied
    expect(a.isSpreadEncoded).toBeUndefined(); // omitted -> auto
  });

  it('preserves a manual spread-encoding override', () => {
    const state = deserialize({
      files: { '/m.cbz': { filePath: '/m.cbz', isSpreadEncoded: true } },
    });
    expect(state.files['/m.cbz'].isSpreadEncoded).toBe(true);
  });

  it('clamps negative lastPage to 0', () => {
    const state = deserialize({ files: { '/a.pdf': { filePath: '/a.pdf', lastPage: -5 } } });
    expect(state.files['/a.pdf'].lastPage).toBe(0);
  });
});

describe('round-trip', () => {
  it('serialize -> deserialize preserves a populated state', () => {
    const original: PersistedState = {
      settings: { ...DEFAULT_SETTINGS, rootFolder: '/library', defaultReadingDirection: 'rtl' },
      recentFiles: [
        { filePath: '/a.pdf', displayName: 'A', lastPage: 4, lastReadAt: 1000 },
        {
          filePath: '/b.cbz',
          displayName: 'B',
          lastPage: 0,
          lastReadAt: 2000,
          coverThumbnailPath: '/cache/b.png',
        },
      ],
      files: {
        '/a.pdf': {
          filePath: '/a.pdf',
          lastPage: 4,
          readingDirection: 'ltr',
          zoomPreset: 'fit-width',
        },
        '/b.cbz': {
          filePath: '/b.cbz',
          lastPage: 0,
          readingDirection: 'rtl',
          zoomPreset: 'full-bleed',
          isSpreadEncoded: false,
        },
      },
    };
    const roundTripped = deserialize(JSON.parse(JSON.stringify(serialize(original))));
    expect(roundTripped).toEqual(original);
  });
});

describe('upsertRecentFile', () => {
  const entry = (path: string, at: number): RecentFile => ({
    filePath: path,
    displayName: path,
    lastPage: 0,
    lastReadAt: at,
  });

  it('adds new entries at the front', () => {
    const list = upsertRecentFile([entry('/a', 1)], entry('/b', 2));
    expect(list.map((f) => f.filePath)).toEqual(['/b', '/a']);
  });

  it('dedupes by path and moves the updated entry to the front', () => {
    const start = [entry('/a', 1), entry('/b', 2)];
    const list = upsertRecentFile(start, entry('/a', 9));
    expect(list.map((f) => f.filePath)).toEqual(['/a', '/b']);
    expect(list[0].lastReadAt).toBe(9);
  });

  it('caps the list length', () => {
    let list: RecentFile[] = [];
    for (let i = 0; i < MAX_RECENT_FILES + 10; i++) {
      list = upsertRecentFile(list, entry(`/f${i}`, i));
    }
    expect(list.length).toBe(MAX_RECENT_FILES);
    expect(list[0].filePath).toBe(`/f${MAX_RECENT_FILES + 9}`); // newest first
  });
});
