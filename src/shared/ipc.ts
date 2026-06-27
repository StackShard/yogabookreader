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
}

/** A recent-files entry as the splash screen consumes it. */
export interface RecentFileView {
  filePath: string;
  displayName: string;
  lastPage: number;
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
  getLibrary: 'r2m:get-library',
  next: 'r2m:next',
  prev: 'r2m:prev',
  jumpToPage: 'r2m:jump-to-page',
  toggleDirection: 'r2m:toggle-direction',
  setZoomPreset: 'r2m:set-zoom-preset',
  setSpreadEncoded: 'r2m:set-spread-encoded',
  getRecentFiles: 'r2m:get-recent-files',
  getSettings: 'r2m:get-settings',
  requestOverlay: 'r2m:request-overlay',
  toggleFullScreen: 'r2m:toggle-full-screen',
  quit: 'r2m:quit',
} as const;

/** Channels from main → renderer (webContents.send). */
export const MainToRenderer = {
  init: 'm2r:init',
  documentLoaded: 'm2r:document-loaded',
  render: 'm2r:render',
  showError: 'm2r:show-error',
  showOverlay: 'm2r:show-overlay',
  fullScreenChanged: 'm2r:full-screen-changed',
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
  onFullScreenChanged(cb: (isFullScreen: boolean) => void): void;

  ready(): void;
  openFile(filePath: string): void;
  pickFile(): void;
  openLibrary(): void;
  next(): void;
  prev(): void;
  jumpToPage(pageIndex: number): void;
  toggleDirection(): void;
  setZoomPreset(preset: ZoomPreset): void;
  setSpreadEncoded(value: boolean | undefined): void;
  requestOverlay(): void;
  toggleFullScreen(): void;
  quit(): void;

  getRecentFiles(): Promise<RecentFileView[]>;
  getSettings(): Promise<AppSettings>;
  getLibrary(): Promise<LibraryItemView[]>;
}

/** A library catalogue entry as the gallery consumes it. */
export interface LibraryItemView {
  filePath: string;
  displayName: string;
  type: DocumentType;
}

declare global {
  interface Window {
    reader: ReaderBridge;
  }
}
