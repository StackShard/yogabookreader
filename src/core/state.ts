/**
 * State persistence helpers (PRD §State Persistence, US#15/#16/#17, Testing
 * §"State persistence round-trip").
 *
 * Pure serialization/normalization logic. The actual file I/O lives in
 * `src/main/state-store.ts`; here we only turn the persisted blob into a
 * well-formed object (filling defaults for forward/backward compatibility) and
 * maintain the recent-files list. Keeping this pure makes the round-trip
 * trivially testable.
 */

import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  EDGE_DEAD_ZONE_MAX,
  DEFAULT_SETTINGS,
  type AppSettings,
  type PersistedState,
  type PerFileState,
  type ReadingDirection,
  type RecentFile,
  type ZoomPreset,
} from './types.js';

/** How many entries the recent-files list retains. */
export const MAX_RECENT_FILES = 8;

const READING_DIRECTIONS: ReadingDirection[] = ['ltr', 'rtl'];
const ZOOM_PRESETS: ZoomPreset[] = ['fit-height', 'fit-width', 'full-bleed'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Normalize an arbitrary parsed object into valid {@link AppSettings}. */
export function normalizeSettings(raw: unknown): AppSettings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  const tapZone =
    typeof raw.tapZoneWidth === 'number' && raw.tapZoneWidth > 0 && raw.tapZoneWidth <= 0.5
      ? raw.tapZoneWidth
      : DEFAULT_SETTINGS.tapZoneWidth;
  const brightness =
    typeof raw.brightness === 'number'
      ? Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, Math.round(raw.brightness)))
      : DEFAULT_SETTINGS.brightness;
  const edgeDeadZone =
    typeof raw.edgeDeadZone === 'number' && raw.edgeDeadZone >= 0 && raw.edgeDeadZone <= EDGE_DEAD_ZONE_MAX
      ? raw.edgeDeadZone
      : DEFAULT_SETTINGS.edgeDeadZone;
  return {
    rootFolder: typeof raw.rootFolder === 'string' ? raw.rootFolder : null,
    defaultReadingDirection: pickEnum(
      raw.defaultReadingDirection,
      READING_DIRECTIONS,
      DEFAULT_SETTINGS.defaultReadingDirection,
    ),
    defaultZoomPreset: pickEnum(
      raw.defaultZoomPreset,
      ZOOM_PRESETS,
      DEFAULT_SETTINGS.defaultZoomPreset,
    ),
    tapZoneWidth: tapZone,
    edgeDeadZone,
    brightness,
    // Defaults to true (the user's chosen behavior) when unset.
    disableAdaptiveBrightness:
      typeof raw.disableAdaptiveBrightness === 'boolean'
        ? raw.disableAdaptiveBrightness
        : DEFAULT_SETTINGS.disableAdaptiveBrightness,
    helpShown: raw.helpShown === true,
    animationsEnabled: raw.animationsEnabled === true,
    windowedMode: raw.windowedMode === true,
  };
}

/** Normalize one parsed per-file entry, or null if it lacks a file path. */
export function normalizePerFileState(
  raw: unknown,
  settings: AppSettings,
): PerFileState | null {
  if (!isObject(raw) || typeof raw.filePath !== 'string') return null;
  const lastPage =
    typeof raw.lastPage === 'number' && raw.lastPage >= 0
      ? Math.floor(raw.lastPage)
      : 0;
  const state: PerFileState = {
    filePath: raw.filePath,
    lastPage,
    readingDirection: pickEnum(
      raw.readingDirection,
      READING_DIRECTIONS,
      settings.defaultReadingDirection,
    ),
    zoomPreset: pickEnum(raw.zoomPreset, ZOOM_PRESETS, settings.defaultZoomPreset),
  };
  if (typeof raw.totalPages === 'number' && raw.totalPages > 0) {
    state.totalPages = Math.floor(raw.totalPages);
  }
  if (typeof raw.isSpreadEncoded === 'boolean') {
    state.isSpreadEncoded = raw.isSpreadEncoded;
  }
  if (Array.isArray(raw.spreadBreaks)) {
    const breaks = [
      ...new Set(
        raw.spreadBreaks.filter(
          (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0,
        ),
      ),
    ].sort((a, b) => a - b);
    if (breaks.length > 0) state.spreadBreaks = breaks;
  }
  return state;
}

/** A valid, empty persisted state using defaults. */
export function emptyState(): PersistedState {
  return { settings: { ...DEFAULT_SETTINGS }, recentFiles: [], files: {} };
}

/**
 * Parse the persisted blob (e.g. from JSON) into a fully-formed
 * {@link PersistedState}, applying defaults to anything missing or malformed.
 */
export function deserialize(raw: unknown): PersistedState {
  if (!isObject(raw)) return emptyState();
  const settings = normalizeSettings(raw.settings);

  const files: Record<string, PerFileState> = {};
  if (isObject(raw.files)) {
    for (const value of Object.values(raw.files)) {
      const state = normalizePerFileState(value, settings);
      if (state) files[state.filePath] = state;
    }
  }

  const recentFiles: RecentFile[] = [];
  if (Array.isArray(raw.recentFiles)) {
    for (const entry of raw.recentFiles) {
      if (!isObject(entry) || typeof entry.filePath !== 'string') continue;
      const recent: RecentFile = {
        filePath: entry.filePath,
        displayName:
          typeof entry.displayName === 'string' ? entry.displayName : entry.filePath,
        lastPage:
          typeof entry.lastPage === 'number' && entry.lastPage >= 0
            ? Math.floor(entry.lastPage)
            : 0,
        lastReadAt: typeof entry.lastReadAt === 'number' ? entry.lastReadAt : 0,
      };
      if (typeof entry.totalPages === 'number' && entry.totalPages > 0) {
        recent.totalPages = Math.floor(entry.totalPages);
      }
      if (typeof entry.coverThumbnailPath === 'string') {
        recent.coverThumbnailPath = entry.coverThumbnailPath;
      }
      recentFiles.push(recent);
    }
  }

  return { settings, recentFiles, files };
}

/** Serialize state for writing. (Identity today; a hook for versioning later.) */
export function serialize(state: PersistedState): PersistedState {
  return state;
}

/**
 * Insert or update a recent-files entry: dedupe by path, move to the front
 * (newest first), and cap the list length (PRD §File Management).
 */
export function upsertRecentFile(
  recentFiles: RecentFile[],
  entry: RecentFile,
): RecentFile[] {
  const withoutDup = recentFiles.filter((f) => f.filePath !== entry.filePath);
  return [entry, ...withoutDup].slice(0, MAX_RECENT_FILES);
}

/** Return an empty recent-files list — used when the user clears the list. */
export function clearRecentFiles(): RecentFile[] {
  return [];
}
