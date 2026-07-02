/**
 * Shared types for the pure-logic core.
 *
 * Nothing in `src/core` may import Electron, Node `fs`, or any other I/O. These
 * are plain data structures and the decision functions that operate on them, so
 * the whole module is unit-testable without hardware (PRD §Testing Decisions).
 */

/** Reading order. LTR = Western magazines, RTL = manga. */
export type ReadingDirection = 'ltr' | 'rtl';

/**
 * How many physical displays are driving the reading surface right now.
 * `dual`   = both Yoga Book screens (the normal two-page-spread experience).
 * `single` = folded / one display available -> single-page fallback.
 */
export type DisplayMode = 'dual' | 'single';

/** How a page is sized to fill a screen. */
export type ZoomPreset = 'fit-height' | 'fit-width' | 'full-bleed';

/**
 * Aspect classification of a source page.
 * `single`         = a normal one-physical-page portrait page (~10:16).
 * `double-spread`  = a wide centerfold page (~20:16) meant to span both screens.
 * `spread-encoded` = the document's pages are uniformly wide because each source
 *                    page is a scan of two physical pages already; the app must
 *                    NOT split further.
 */
export type AspectClass = 'single' | 'double-spread' | 'spread-encoded';

/** A logical screen position in a spread. */
export type Side = 'left' | 'right';

/**
 * Which physical-page index goes on a screen, and how to crop it.
 *
 * `pageIndex` is 0-based into the source document's pages.
 * `half` is set only for wide pages (centerfolds and spread-encoded scans),
 * where a single wide source page is cropped into a left half and a right half
 * so it reads continuously across the two screens. Its presence is the signal to
 * the renderer that this screen shows a cropped half rather than a whole page.
 */
export interface ScreenContent {
  pageIndex: number;
  /** For wide source pages: which half of the page to crop onto this screen. */
  half?: Side;
}

/** What each physical screen should render for the current position. */
export interface SpreadLayout {
  left: ScreenContent | null;
  right: ScreenContent | null;
}

/** Persisted, per-document reading state (PRD §State Persistence). */
export interface PerFileState {
  filePath: string;
  /** 0-based index of the page currently anchoring the view. */
  lastPage: number;
  /** Last known page count, used for progress displays. */
  totalPages?: number;
  readingDirection: ReadingDirection;
  zoomPreset: ZoomPreset;
  /**
   * Manual override for spread-encoding detection. `undefined` = use the
   * auto-detected value; `true`/`false` = user forced it (PRD US#22).
   */
  isSpreadEncoded?: boolean;
  /**
   * User-applied spread phase breaks: 0-based page indices that should start a
   * spread alone, inserting a one-page blank so every pair downstream re-aligns.
   * Fixes a skipped/mis-scanned page without moving the reading position. Empty
   * or undefined = normal pairing.
   */
  spreadBreaks?: number[];
}

/** A document as the spread/navigation logic needs to understand it. */
export interface DocumentModel {
  totalPages: number;
  readingDirection: ReadingDirection;
  /** Per-page aspect classes (length === totalPages). */
  pageAspects: AspectClass[];
  /** Effective spread-encoding flag after applying any manual override. */
  isSpreadEncoded: boolean;
  /**
   * 0-based page indices that should start a spread alone (user phase nudges).
   * Each inserts a one-page blank so pairing re-aligns from that page onward.
   */
  spreadBreaks?: number[];
}

/** An entry on the splash screen's recent-files list (PRD §File Management). */
export interface RecentFile {
  filePath: string;
  displayName: string;
  lastPage: number;
  /** Last known page count, used for progress displays. */
  totalPages?: number;
  /** Epoch millis of last read. */
  lastReadAt: number;
  /** Path to the cached cover thumbnail, if generated. */
  coverThumbnailPath?: string;
}

/** Global, non-per-file settings (PRD §Settings Panel). */
export interface AppSettings {
  rootFolder: string | null;
  defaultReadingDirection: ReadingDirection;
  defaultZoomPreset: ZoomPreset;
  /** Fraction (0-0.5) of screen width for each side tap zone. Default 0.4. */
  tapZoneWidth: number;
  /** Fraction (0-0.25) of screen width on each edge where taps are ignored. */
  edgeDeadZone: number;
  /** Screen brightness, 10–100. Applied to hardware backlight (or dim fallback). */
  brightness: number;
  /** Disable Windows adaptive (ambient) brightness while reading; restore on exit. */
  disableAdaptiveBrightness: boolean;
  /** Whether the tap-zone help overlay has been shown once. */
  helpShown: boolean;
  /** v2 page-curl animation toggle. Off in v1. */
  animationsEnabled: boolean;
  windowedMode: boolean;
}

/** Top-level persisted blob written to the state file. */
export interface PersistedState {
  settings: AppSettings;
  recentFiles: RecentFile[];
  /** Per-file state keyed by absolute file path. */
  files: Record<string, PerFileState>;
}

/** Defaults applied when no settings have been saved yet. */
export const DEFAULT_SETTINGS: AppSettings = {
  rootFolder: null,
  defaultReadingDirection: 'ltr',
  defaultZoomPreset: 'fit-width', // default to full screen width per user preference.
  tapZoneWidth: 0.4, // PRD §Touch Navigation: 40% side zones, 20% center.
  edgeDeadZone: 0.07, // outer grip margin on each side, ignored for taps.
  brightness: 100,
  disableAdaptiveBrightness: true,
  helpShown: false,
  animationsEnabled: false,
  windowedMode: false,
};

/** Zoom presets in the order the double-tap gesture cycles through them. */
export const ZOOM_PRESET_CYCLE: ZoomPreset[] = ['fit-height', 'fit-width', 'full-bleed'];

/** The preset after `current` in the double-tap cycle. */
export function nextZoomPreset(current: ZoomPreset): ZoomPreset {
  const idx = ZOOM_PRESET_CYCLE.indexOf(current);
  return ZOOM_PRESET_CYCLE[(idx + 1) % ZOOM_PRESET_CYCLE.length];
}

/** Brightness slider bounds and step (granular but fixed increments). */
export const BRIGHTNESS_MIN = 10;
export const BRIGHTNESS_MAX = 100;
export const BRIGHTNESS_STEP = 10;

/** Max fraction allowed for the edge dead-zone on each side. */
export const EDGE_DEAD_ZONE_MAX = 0.25;
