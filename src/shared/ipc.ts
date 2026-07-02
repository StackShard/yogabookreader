/**
 * IPC contract shared by the main process, preload bridge, and renderers.
 *
 * The main process owns the single source of truth (the open document and the
 * current spread index). It computes spreads with the pure core logic and pushes
 * each window a concrete {@link RenderTarget} describing exactly what to paint.
 * Renderers send back navigation intents and settings changes.
 */

import type {
  AppSettings,
  ReadingDirection,
  Side,
  ZoomPreset,
} from '../core/types.js';

/** Which window this renderer is. `single` = folded-device fallback. */
export type WindowRole = 'left' | 'right' | 'single';

export type DocumentType = 'pdf' | 'cbz' | 'cbr';

/** A concrete thing to render on one screen, resolved by the main process. */
export type RenderTarget =
  | { kind: 'pdf'; filePath: string; pageIndex: number; half?: Side }
  | { kind: 'image'; imagePath: string; pageIndex: number; half?: Side }
  | { kind: 'blank' };

/** Metadata about the open document, sent once on load. */
export interface DocumentInfo {
  filePath: string;
  displayName: string;
  type: DocumentType;
  totalPages: number;
  spreadCount: number;
  readingDirection: ReadingDirection;
  zoomPreset: ZoomPreset;
  isSpreadEncoded: boolean;
}

/** Per-window instruction to render the current spread. */
export interface RenderInstruction {
  current: RenderTarget;
  /** Targets to warm into the prerender buffer (next/prev for this window). */
  prefetch: RenderTarget[];
  zoomPreset: ZoomPreset;
  spreadIndex: number;
  /** 0-based page indices shown in the current spread (for progress display). */
  pages: number[];
  /** Current reading direction, so input mapping tracks the ↔ toggle live. */
  readingDirection: ReadingDirection;
}

/** Outcome of a save-page request, so the renderer can report failures. */
export type SavePageResult = 'saved' | 'canceled' | 'failed';

/** A recent-files entry as the splash screen consumes it. */
export interface RecentFileView {
  filePath: string;
  displayName: string;
  lastPage: number;
  /** Last known page count, for progress display. */
  totalPages?: number;
  lastReadAt: number;
  coverThumbnailPath?: string;
}

/** An in-app error to display instead of content (PRD §Error Handling). */
export interface ReaderError {
  filePath: string;
  reason: 'corrupt' | 'encrypted' | 'unsupported' | 'not-found' | 'unknown';
  message: string;
}

/** Channels from renderer → main (invoke/handle or send). */
export const RendererToMain = {
  ready: 'r2m:ready',
  openFile: 'r2m:open-file',
  pickFile: 'r2m:pick-file',
  openLibrary: 'r2m:open-library',
  resume: 'r2m:resume',
  getResumeInfo: 'r2m:get-resume-info',
  getLibrary: 'r2m:get-library',
  getLibraryCached: 'r2m:get-library-cached',
  pickFolder: 'r2m:pick-folder',
  getCachedCover: 'r2m:get-cached-cover',
  getCachedCovers: 'r2m:get-cached-covers',
  getCoverSource: 'r2m:get-cover-source',
  saveCover: 'r2m:save-cover',
  setBrightness: 'r2m:set-brightness',
  next: 'r2m:next',
  prev: 'r2m:prev',
  jumpToPage: 'r2m:jump-to-page',
  toggleDirection: 'r2m:toggle-direction',
  setZoomPreset: 'r2m:set-zoom-preset',
  setSpreadEncoded: 'r2m:set-spread-encoded',
  nudgeSpread: 'r2m:nudge-spread',
  resetSpread: 'r2m:reset-spread',
  savePage: 'r2m:save-page',
  printPage: 'r2m:print-page',
  getRecentFiles: 'r2m:get-recent-files',
  clearRecentFiles: 'r2m:clear-recent-files',
  removeRecentFile: 'r2m:remove-recent-file',
  getSettings: 'r2m:get-settings',
  requestOverlay: 'r2m:request-overlay',
  toggleFullScreen: 'r2m:toggle-full-screen',
  setAdaptiveBrightnessDisabled: 'r2m:set-adaptive-brightness-disabled',
  requestHelp: 'r2m:request-help',
  dismissHelp: 'r2m:dismiss-help',
  quit: 'r2m:quit',
  openExternal: 'r2m:open-external',
  openContainingFolder: 'r2m:open-containing-folder',
  pruneMissingRecentFiles: 'r2m:prune-missing-recent-files',
  clearCoverCache: 'r2m:clear-cover-cache',
  getLayoutInfo: 'r2m:get-layout-info',
  getAppInfo: 'r2m:get-app-info',
} as const;

/** Channels from main → renderer (webContents.send). */
export const MainToRenderer = {
  init: 'm2r:init',
  documentLoaded: 'm2r:document-loaded',
  render: 'm2r:render',
  showError: 'm2r:show-error',
  showOverlay: 'm2r:show-overlay',
  showHelp: 'm2r:show-help',
  hideHelp: 'm2r:hide-help',
  fullScreenChanged: 'm2r:full-screen-changed',
  setDim: 'm2r:set-dim',
  status: 'm2r:status',
} as const;

/** Payload of the one-time init message that tells a window its role. */
export interface InitPayload {
  role: WindowRole;
}

/** The typed API the preload bridge exposes on `window.reader`. */
export interface ReaderBridge {
  onInit(cb: (payload: InitPayload) => void): void;
  onDocumentLoaded(cb: (info: DocumentInfo) => void): void;
  onRender(cb: (instruction: RenderInstruction) => void): void;
  onShowError(cb: (error: ReaderError) => void): void;
  onShowOverlay(cb: () => void): void;
  onShowHelp(cb: () => void): void;
  onHideHelp(cb: () => void): void;
  onFullScreenChanged(cb: (isFullScreen: boolean) => void): void;
  onSetDim(cb: (level: number | null) => void): void;
  onStatus(cb: (message: string | null) => void): void;

  ready(): void;
  openFile(filePath: string): void;
  pickFile(): void;
  openLibrary(): void;
  resume(): void;
  setBrightness(level: number): void;
  next(): void;
  prev(): void;
  jumpToPage(pageIndex: number): void;
  toggleDirection(): void;
  setZoomPreset(preset: ZoomPreset): void;
  setSpreadEncoded(value: boolean | undefined): void;
  /** Phase-nudge spread pairing from the current page (toggles at that page). */
  nudgeSpread(): void;
  /** Clear all phase nudges, restoring normal pairing. */
  resetSpread(): void;
  /**
   * Save one page to a file. `dataUrl` carries the rendered PNG for PDF pages;
   * pass null for comic pages (main copies the original image).
   */
  savePage(pageIndex: number, dataUrl: string | null): Promise<SavePageResult>;
  /** Print one page via the system print dialog. `dataUrl` as for {@link savePage}. */
  printPage(pageIndex: number, dataUrl: string | null): void;
  requestOverlay(): void;
  toggleFullScreen(): void;
  setAdaptiveBrightnessDisabled(disabled: boolean): void;
  requestHelp(): void;
  dismissHelp(): void;
  quit(): void;
  openExternal(url: string): void;
  /** Reveal a file in the OS file manager (Explorer). */
  openContainingFolder(filePath: string): void;

  getRecentFiles(): Promise<RecentFileView[]>;
  clearRecentFiles(): void;
  removeRecentFile(filePath: string): void;
  /** Drop recent entries whose files no longer exist; returns removed paths. */
  pruneMissingRecentFiles(): Promise<string[]>;
  /** Delete all cached cover thumbnails. */
  clearCoverCache(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  getLibrary(): Promise<LibraryGroup[]>;
  getLibraryCached(): Promise<LibraryGroup[]>;
  pickFolder(): Promise<LibraryGroup[]>;
  getResumeInfo(): Promise<ResumeInfo | null>;
  getLayoutInfo(): Promise<LayoutInfo>;
  getAppInfo(): Promise<AppInfo>;
  getCachedCover(filePath: string): Promise<string | null>;
  /**
   * Batch cache check: which of `filePaths` already have a cached cover, in
   * one round trip. Returns only the hits (path → cover URL); a path absent
   * from the result is a miss. Used instead of N individual
   * {@link getCachedCover} calls when rendering a large library.
   */
  getCachedCovers(filePaths: string[]): Promise<Record<string, string>>;
  getCoverSource(filePath: string): Promise<CoverSource | null>;
  saveCover(filePath: string, dataUrl: string): Promise<string | null>;
}

/** A library catalogue entry as the gallery consumes it. */
export interface LibraryItemView {
  filePath: string;
  displayName: string;
  type: DocumentType;
  /** Last-read page (0-based) and known page count, for progress display. */
  lastPage?: number;
  totalPages?: number;
}

/** Display-layout summary for the splash single-/dual-screen diagnostic. */
export interface LayoutInfo {
  mode: 'dual' | 'single' | 'ambiguous';
  displayCount: number;
  portraitCount: number;
}

/** App version + build identifier, shown on the help screen. */
export interface AppInfo {
  version: string;
  commit: string;
}

/** A sub-folder's worth of library items (one section in the gallery). */
export interface LibraryGroup {
  folder: string;
  items: LibraryItemView[];
}

/** Source the renderer needs to render a cover thumbnail. */
export interface CoverSource {
  kind: 'pdf' | 'image';
  /** yreader:// URL to the PDF file or the first comic image. */
  url: string;
}

/** The currently-open document, for the splash "Resume reading" button. */
export interface ResumeInfo {
  filePath: string;
  displayName: string;
}

declare global {
  interface Window {
    reader: ReaderBridge;
  }
}
