/**
 * Persistent state store (PRD §State Persistence, §"No database").
 *
 * Thin I/O wrapper around the pure helpers in `src/core/state.ts`. Reads/writes a
 * single flat JSON file via electron-store; all normalization and the
 * recent-files logic live in the testable core.
 */

import Store from 'electron-store';
import {
  deserialize,
  emptyState,
  upsertRecentFile,
} from '../core/state.js';
import type {
  AppSettings,
  PerFileState,
  PersistedState,
  RecentFile,
} from '../core/types.js';

const store = new Store<{ state: unknown; libraryCache: unknown }>({
  name: 'state', // -> <userData>/state.json
});

/** Opaque cache of the last library scan, so the splash can show it instantly. */
export interface LibraryCache {
  rootFolder: string;
  groups: unknown;
}

interface RawStore {
  state: unknown;
  libraryCache: unknown;
}

// electron-store (via `conf`) re-reads and re-parses the ENTIRE backing file
// from disk on every single `.get()` call, with no caching of its own. The
// launch path alone calls into this module 7+ times (settings, file states,
// recent files, library cache, twice more for the fresh rescan), and on a
// library with 1000+ tracked files/cached items that file isn't tiny — each
// of those was a separate synchronous full-file read blocking the main
// process. Mirror the whole store in memory instead: one real read for the
// life of the process, updated in place on every write so reads never go
// stale. Safe because this app enforces a single instance and is the sole
// writer of its own state file.
let cache: RawStore | null = null;

function raw(): RawStore {
  if (!cache) cache = store.store as RawStore;
  return cache;
}

export function getLibraryCache(): LibraryCache | null {
  const v = raw().libraryCache;
  if (v && typeof v === 'object' && typeof (v as LibraryCache).rootFolder === 'string') {
    return v as LibraryCache;
  }
  return null;
}

export function setLibraryCache(rootFolder: string, groups: unknown): void {
  const libraryCache = { rootFolder, groups };
  store.set('libraryCache', libraryCache);
  cache = { ...raw(), libraryCache };
}

function load(): PersistedState {
  try {
    return deserialize(raw().state);
  } catch {
    return emptyState();
  }
}

function save(state: PersistedState): void {
  store.set('state', state);
  cache = { ...raw(), state };
}

export function getSettings(): AppSettings {
  return load().settings;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const state = load();
  state.settings = { ...state.settings, ...patch };
  save(state);
  return state.settings;
}

export function getFileState(filePath: string): PerFileState | undefined {
  return load().files[filePath];
}

/** All per-file states keyed by path. Use when looking up many files at once to
 *  avoid re-deserializing the whole store per lookup. */
export function getFileStates(): Record<string, PerFileState> {
  return load().files;
}

/** Merge a per-file state patch and persist it. */
export function saveFileState(patch: PerFileState): void {
  const state = load();
  state.files[patch.filePath] = { ...state.files[patch.filePath], ...patch };
  save(state);
}

/**
 * Persist a per-file state patch and its recent-files entry in ONE load/save.
 * This runs on every page turn; two separate calls would double the synchronous
 * disk writes (the store targets slow eMMC devices).
 */
export function saveFileStateAndRecent(patch: PerFileState, entry: RecentFile): void {
  const state = load();
  state.files[patch.filePath] = { ...state.files[patch.filePath], ...patch };
  state.recentFiles = upsertRecentFile(state.recentFiles, entry);
  save(state);
}

export function getRecentFiles(): RecentFile[] {
  return load().recentFiles;
}

export function recordRecentFile(entry: RecentFile): void {
  const state = load();
  state.recentFiles = upsertRecentFile(state.recentFiles, entry);
  save(state);
}

export function clearRecentFiles(): void {
  const state = load();
  state.recentFiles = [];
  save(state);
}

export function removeRecentFile(filePath: string): void {
  const state = load();
  state.recentFiles = state.recentFiles.filter((f) => f.filePath !== filePath);
  save(state);
}
