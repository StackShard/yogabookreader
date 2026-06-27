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

const store = new Store<{ state: unknown }>({
  name: 'state', // -> <userData>/state.json
});

function load(): PersistedState {
  try {
    return deserialize(store.get('state'));
  } catch {
    return emptyState();
  }
}

function save(state: PersistedState): void {
  store.set('state', state);
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

/** Merge a per-file state patch and persist it. */
export function saveFileState(patch: PerFileState): void {
  const state = load();
  state.files[patch.filePath] = { ...state.files[patch.filePath], ...patch };
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
