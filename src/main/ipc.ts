/**
 * IPC controller (PRD §Multi-Window Architecture).
 *
 * Owns the open {@link ReaderSession} and the reader windows, registers all
 * renderer→main handlers, and broadcasts per-window render instructions. The
 * main process is the single source of truth; both windows are kept in lockstep.
 */

import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { ReadingDirection, ZoomPreset } from '../core/types.js';
import {
  MainToRenderer,
  RendererToMain,
  type LibraryItemView,
  type ReaderError,
  type RecentFileView,
} from '../shared/ipc.js';
import {
  detectType,
  loadComic,
  FileLoadError,
} from './file-loader.js';
import { loadPdfMeta } from './pdf-meta.js';
import { ReaderSession } from './session.js';
import { scanFolder } from './library-scanner.js';
import { currentPlacement, loadPage, type ReaderPage, type ReaderWindow } from './windows.js';
import {
  getFileState,
  getRecentFiles,
  getSettings,
  recordRecentFile,
  saveFileState,
} from './state-store.js';

export class ReaderController {
  private session: ReaderSession | null = null;
  private pendingError: ReaderError | null = null;
  private windows: ReaderWindow[] = [];

  setWindows(windows: ReaderWindow[]): void {
    this.windows = windows;
  }

  registerHandlers(): void {
    // A reader window signals `ready` after each (re)load; push it the current
    // document + spread, or the pending error if a load failed.
    ipcMain.on(RendererToMain.ready, (e) => this.onRendererReady(e.sender));
    ipcMain.on(RendererToMain.next, () => {
      this.session?.next();
      this.persistAndRender();
    });
    ipcMain.on(RendererToMain.prev, () => {
      this.session?.prev();
      this.persistAndRender();
    });
    ipcMain.on(RendererToMain.jumpToPage, (_e, pageIndex: number) => {
      this.session?.jumpToPage(pageIndex);
      this.persistAndRender();
    });
    ipcMain.on(RendererToMain.toggleDirection, () => this.toggleDirection());
    ipcMain.on(RendererToMain.setZoomPreset, (_e, preset: ZoomPreset) => {
      this.session?.setZoomPreset(preset);
      this.persistAndRender();
    });
    ipcMain.on(RendererToMain.openFile, (_e, filePath: string) => {
      void this.openDocument(filePath);
    });
    ipcMain.on(RendererToMain.setSpreadEncoded, (_e, value: boolean | undefined) => {
      void this.setSpreadEncoded(value);
    });
    ipcMain.on(RendererToMain.requestOverlay, () => this.showOverlay());
    ipcMain.on(RendererToMain.openLibrary, () => this.openLibraryView());
    ipcMain.on(RendererToMain.exitFullScreen, () => {
      for (const { window } of this.windows) window.setFullScreen(false);
    });

    ipcMain.handle(RendererToMain.getRecentFiles, (): RecentFileView[] =>
      getRecentFiles().map((f) => ({
        filePath: f.filePath,
        displayName: f.displayName,
        lastPage: f.lastPage,
        lastReadAt: f.lastReadAt,
        coverThumbnailPath: f.coverThumbnailPath,
      })),
    );
    ipcMain.handle(RendererToMain.getSettings, () => getSettings());
    ipcMain.handle(RendererToMain.getLibrary, () => this.getLibrary());
    ipcMain.on(RendererToMain.pickFile, () => {
      void this.pickFile();
    });
  }

  private async getLibrary(): Promise<LibraryItemView[]> {
    const root = getSettings().rootFolder;
    if (!root) return [];
    const entries = await scanFolder(root);
    return entries.map((e) => ({
      filePath: e.filePath,
      displayName: e.displayName,
      type: e.type,
    }));
  }

  private async pickFile(): Promise<void> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'cbz', 'cbr'] }],
    });
    if (!result.canceled && result.filePaths[0]) {
      await this.openDocument(result.filePaths[0]);
    }
  }

  /** Navigate every window to the splash launcher or the reader page. */
  private navigateAll(page: ReaderPage): void {
    for (const { role, window } of this.windows) {
      if (!window.isDestroyed()) loadPage(window, role, page);
    }
  }

  /** Return all windows to the splash/library launcher (closes the document). */
  private openLibraryView(): void {
    this.session = null;
    this.pendingError = null;
    this.navigateAll('splash');
  }

  /** Push current state to a window once its reader page has (re)loaded. */
  private onRendererReady(sender: Electron.WebContents): void {
    const win = this.windows.find((w) => w.window.webContents === sender);
    if (!win || win.window.isDestroyed()) return;
    if (this.session) {
      win.window.webContents.send(MainToRenderer.documentLoaded, this.session.describe());
      win.window.webContents.send(MainToRenderer.render, this.session.instructionFor(win.role));
    } else if (this.pendingError) {
      win.window.webContents.send(MainToRenderer.showError, this.pendingError);
    }
  }

  private failOpen(error: ReaderError): void {
    this.session = null;
    this.pendingError = error;
    this.navigateAll('reader'); // reader page hosts the error UI
  }

  /** Open a document, building a session and broadcasting it to all windows. */
  async openDocument(filePath: string): Promise<void> {
    const type = detectType(filePath);
    if (!type) {
      this.failOpen({
        filePath,
        reason: 'unsupported',
        message: 'Unsupported file type.',
      });
      return;
    }

    const settings = getSettings();
    const fileState = getFileState(filePath);
    const readingDirection = fileState?.readingDirection ?? settings.defaultReadingDirection;
    const zoomPreset = fileState?.zoomPreset ?? settings.defaultZoomPreset;
    const override = fileState?.isSpreadEncoded;
    const displayMode = currentPlacement().mode === 'dual' ? 'dual' : 'single';

    try {
      if (type === 'pdf') {
        const meta = await loadPdfMeta(filePath, override);
        this.session = new ReaderSession({
          filePath,
          displayName: path.basename(filePath, path.extname(filePath)),
          type,
          pdfPath: filePath,
          totalPages: meta.totalPages,
          pageAspects: meta.pageAspects,
          isSpreadEncoded: meta.isSpreadEncoded,
          readingDirection,
          zoomPreset,
          displayMode,
          startPage: fileState?.lastPage,
        });
      } else {
        const comic = await loadComic(filePath, type, override);
        this.session = new ReaderSession({
          filePath,
          displayName: path.basename(filePath, path.extname(filePath)),
          type,
          imagePaths: comic.imagePaths,
          totalPages: comic.totalPages,
          pageAspects: comic.pageAspects,
          isSpreadEncoded: comic.isSpreadEncoded,
          readingDirection,
          zoomPreset,
          displayMode,
          startPage: fileState?.lastPage,
        });
      }
    } catch (err) {
      this.failOpen(
        err instanceof FileLoadError
          ? err.error
          : { filePath, reason: 'unknown', message: (err as Error).message },
      );
      return;
    }

    this.pendingError = null;
    recordRecentFile({
      filePath,
      displayName: this.session.describe().displayName,
      lastPage: this.session.anchorPage,
      lastReadAt: Date.now(),
    });

    // Bring every window to the reader page; each will request its content via
    // `ready` once loaded (see onRendererReady).
    this.navigateAll('reader');
  }

  /**
   * Apply a manual spread-encoding override (PRD US#22): persist it and reopen
   * the document so its pages are re-classified with the new setting.
   */
  private async setSpreadEncoded(value: boolean | undefined): Promise<void> {
    if (!this.session) return;
    const filePath = this.session.describe().filePath;
    const existing = getFileState(filePath);
    saveFileState({
      filePath,
      lastPage: existing?.lastPage ?? this.session.anchorPage,
      readingDirection: existing?.readingDirection ?? this.session.readingDirection,
      zoomPreset: existing?.zoomPreset ?? this.session.describe().zoomPreset,
      isSpreadEncoded: value,
    });
    await this.openDocument(filePath);
  }

  private toggleDirection(): void {
    if (!this.session) return;
    const next: ReadingDirection = this.session.readingDirection === 'ltr' ? 'rtl' : 'ltr';
    this.session.setReadingDirection(next);
    this.persistAndRender();
  }

  /** Recompute placement after a display change and rebuild windows if needed. */
  refreshDisplayMode(): void {
    if (!this.session) return;
    const mode = currentPlacement().mode === 'dual' ? 'dual' : 'single';
    this.session.setDisplayMode(mode);
    this.broadcastRender();
  }

  private persistAndRender(): void {
    if (this.session) {
      const info = this.session.describe();
      saveFileState({
        filePath: info.filePath,
        lastPage: this.session.anchorPage,
        readingDirection: info.readingDirection,
        zoomPreset: info.zoomPreset,
        isSpreadEncoded: info.isSpreadEncoded,
      });
    }
    this.broadcastRender();
  }

  private broadcastRender(): void {
    if (!this.session) return;
    for (const { role, window } of this.windows) {
      if (window.isDestroyed()) continue;
      window.webContents.send(MainToRenderer.render, this.session.instructionFor(role));
    }
  }

  /** Show the control overlay (right window only, PRD §Control Overlay). */
  showOverlay(): void {
    const overlayWindow =
      this.windows.find((w) => w.role === 'right') ?? this.windows.find((w) => w.role === 'single');
    overlayWindow?.window.webContents.send(MainToRenderer.showOverlay);
  }

  allWindows(): BrowserWindow[] {
    return this.windows.map((w) => w.window);
  }
}
