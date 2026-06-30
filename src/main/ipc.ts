/**
 * IPC controller (PRD §Multi-Window Architecture).
 *
 * Owns the open {@link ReaderSession} and the reader windows, registers all
 * renderer→main handlers, and broadcasts per-window render instructions. The
 * main process is the single source of truth; both windows are kept in lockstep.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import {
  type DisplayMode,
  type ReadingDirection,
  type ZoomPreset,
} from '../core/types.js';
import {
  MainToRenderer,
  RendererToMain,
  type AppInfo,
  type CoverSource,
  type LayoutInfo,
  type LibraryGroup,
  type LibraryItemView,
  type ReaderError,
  type RecentFileView,
  type ResumeInfo,
} from '../shared/ipc.js';
import {
  detectType,
  FileLoadError,
} from './file-loader.js';
import { ReaderSession } from './session.js';
import { analyzeFile, refineClassification } from './document-opener.js';
import { scanFolder, thumbnailCacheDir } from './library-scanner.js';
import { extractFirstImage, hashPath } from './cbz-extractor.js';
import { fileUrl as coverUrl } from './protocol.js';
import { currentPlacement, loadPage, type ReaderPage, type ReaderWindow } from './windows.js';
import { log, logError } from './log.js';
import {
  clearRecentFiles,
  getFileState,
  getFileStates,
  getLibraryCache,
  getRecentFiles,
  getSettings,
  recordRecentFile,
  removeRecentFile,
  saveFileState,
  setLibraryCache,
  updateSettings,
} from './state-store.js';
import { BrightnessController } from './brightness-controller.js';

/** Short git commit injected at build time (see electron.vite.config.ts). */
declare const __BUILD_COMMIT__: string | undefined;
const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev';

export class ReaderController {
  private session: ReaderSession | null = null;
  private pendingError: ReaderError | null = null;
  private windows: ReaderWindow[] = [];
  private windowFactory: () => ReaderWindow[] = () => [];
  private rebuilding = false;
  /** Incremented per open; guards background classification against stale applies. */
  private openToken = 0;
  private readonly brightness = new BrightnessController();

  setWindows(windows: ReaderWindow[]): void {
    this.windows = windows;
  }

  /** How new window sets are created (injected by the entry point). */
  setWindowFactory(factory: () => ReaderWindow[]): void {
    this.windowFactory = factory;
  }

  /** True while windows are being torn down and recreated for a layout change. */
  get isRebuilding(): boolean {
    return this.rebuilding;
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
    ipcMain.on(RendererToMain.nudgeSpread, () => this.nudgeSpread());
    ipcMain.on(RendererToMain.resetSpread, () => this.resetSpread());
    ipcMain.handle(RendererToMain.savePage, (_e, pageIndex: number, dataUrl: string | null) =>
      this.savePage(pageIndex, dataUrl),
    );
    ipcMain.on(RendererToMain.printPage, (_e, pageIndex: number, dataUrl: string | null) => {
      void this.printPage(pageIndex, dataUrl).catch((err) => logError('printPage failed:', err));
    });
    ipcMain.on(RendererToMain.requestOverlay, () => this.showOverlay());
    ipcMain.on(RendererToMain.openLibrary, () => this.openLibraryView());
    ipcMain.on(RendererToMain.toggleFullScreen, () => this.toggleFullScreen());
    ipcMain.on(RendererToMain.quit, () => app.quit());

    ipcMain.handle(RendererToMain.getRecentFiles, (): RecentFileView[] =>
      getRecentFiles().map((f) => ({
        filePath: f.filePath,
        displayName: f.displayName,
        lastPage: f.lastPage,
        totalPages: f.totalPages,
        lastReadAt: f.lastReadAt,
        coverThumbnailPath: f.coverThumbnailPath,
      })),
    );
    ipcMain.on(RendererToMain.clearRecentFiles, () => {
      clearRecentFiles();
    });
    ipcMain.on(RendererToMain.removeRecentFile, (_e, filePath: string) => {
      removeRecentFile(filePath);
    });
    ipcMain.on(RendererToMain.openContainingFolder, (_e, filePath: string) => {
      shell.showItemInFolder(path.normalize(filePath));
    });
    ipcMain.handle(RendererToMain.pruneMissingRecentFiles, () => this.pruneMissingRecentFiles());
    ipcMain.handle(RendererToMain.clearCoverCache, () => this.clearCoverCache());
    ipcMain.handle(RendererToMain.getLayoutInfo, (): LayoutInfo => this.getLayoutInfo());
    ipcMain.handle(RendererToMain.getAppInfo, (): AppInfo => ({
      version: app.getVersion(),
      commit: BUILD_COMMIT,
    }));
    ipcMain.handle(RendererToMain.getSettings, () => getSettings());
    ipcMain.handle(RendererToMain.getLibrary, () => this.getLibrary());
    ipcMain.handle(RendererToMain.getLibraryCached, () => this.getLibraryCached());
    ipcMain.handle(RendererToMain.pickFolder, () => this.pickFolder());
    ipcMain.handle(RendererToMain.getResumeInfo, () => this.getResumeInfo());
    ipcMain.handle(RendererToMain.getCachedCover, (_e, fp: string) => this.getCachedCover(fp));
    ipcMain.handle(RendererToMain.getCoverSource, (_e, fp: string) => this.getCoverSource(fp));
    ipcMain.handle(RendererToMain.saveCover, (_e, fp: string, durl: string) =>
      this.saveCover(fp, durl),
    );
    ipcMain.on(RendererToMain.pickFile, () => {
      this.pickFile().catch((e) => logError('pickFile failed:', e));
    });
    ipcMain.on(RendererToMain.resume, () => this.resume());
    ipcMain.on(RendererToMain.setBrightness, (_e, level: number) => {
      void this.setBrightness(level);
    });
    ipcMain.on(RendererToMain.setAdaptiveBrightnessDisabled, (_e, disabled: boolean) => {
      void this.setAdaptiveBrightnessDisabled(disabled);
    });
    ipcMain.on(RendererToMain.requestHelp, () => this.broadcast(MainToRenderer.showHelp));
    ipcMain.on(RendererToMain.dismissHelp, () => {
      updateSettings({ helpShown: true });
      this.broadcast(MainToRenderer.hideHelp);
    });
    ipcMain.on(RendererToMain.openExternal, (_e, url: string) => {
      void shell.openExternal(url);
    });
  }

  /** Send a no-payload message to every live window. */
  private broadcast(channel: string): void {
    for (const { window } of this.windows) {
      if (!window.isDestroyed()) window.webContents.send(channel);
    }
  }

  /** The open document for the splash "Resume reading" button, if any. */
  private getResumeInfo(): ResumeInfo | null {
    if (!this.session) return null;
    const info = this.session.describe();
    return { filePath: info.filePath, displayName: info.displayName };
  }

  /** Single-/dual-screen summary for the splash layout diagnostic. */
  private getLayoutInfo(): LayoutInfo {
    const displays = screen.getAllDisplays();
    return {
      mode: currentPlacement().mode,
      displayCount: displays.length,
      portraitCount: displays.filter((d) => d.bounds.height > d.bounds.width).length,
    };
  }

  /** Remove recent entries whose files are gone; returns the removed paths. */
  private async pruneMissingRecentFiles(): Promise<string[]> {
    const missing: string[] = [];
    for (const f of getRecentFiles()) {
      try {
        await fs.access(f.filePath);
      } catch {
        missing.push(f.filePath);
        removeRecentFile(f.filePath);
      }
    }
    return missing;
  }

  /** Delete every cached cover thumbnail; covers regenerate on demand. */
  private async clearCoverCache(): Promise<void> {
    await fs.rm(thumbnailCacheDir(), { recursive: true, force: true });
  }

  /** Return from the library to the current document without reloading it. */
  private resume(): void {
    if (this.session) this.navigateAll('reader');
  }

  /**
   * Apply a brightness level (PRD §Settings): persist it, try the real hardware
   * backlight, and tell the renderers whether to apply the dim-overlay fallback.
   */
  private async setBrightness(level: number): Promise<void> {
    const { dimLevel } = await this.brightness.set(level);
    this.broadcastDim(dimLevel);
  }

  /**
   * Apply persisted brightness settings at startup: optionally disable Windows
   * adaptive brightness (so it can't override the manual level), then set it.
   */
  async applyStoredBrightness(): Promise<void> {
    const { dimLevel } = await this.brightness.startup();
    this.broadcastDim(dimLevel);
  }

  /** Toggle disabling of Windows adaptive brightness (persisted). */
  private async setAdaptiveBrightnessDisabled(disabled: boolean): Promise<void> {
    const result = await this.brightness.setAdaptiveDisabled(disabled);
    if (result) this.broadcastDim(result.dimLevel);
  }

  /** Restore Windows adaptive brightness (call on quit). */
  async restoreAdaptiveBrightness(): Promise<void> {
    await this.brightness.shutdown();
  }

  private broadcastDim(level: number | null): void {
    for (const { window } of this.windows) {
      if (!window.isDestroyed()) window.webContents.send(MainToRenderer.setDim, level);
    }
  }

  /** Scanned library grouped into one section per sub-folder. */
  private async getLibrary(): Promise<LibraryGroup[]> {
    const root = getSettings().rootFolder;
    if (!root) return [];
    const entries = await scanFolder(root);
    const fileStates = getFileStates();
    const groups = new Map<string, LibraryItemView[]>();
    for (const e of entries) {
      const folder = e.relativeDir === '' ? 'Library' : e.relativeDir;
      const fileState = fileStates[e.filePath];
      const item: LibraryItemView = {
        filePath: e.filePath,
        displayName: e.displayName,
        type: e.type,
        lastPage: fileState?.lastPage,
        totalPages: fileState?.totalPages,
      };
      const list = groups.get(folder);
      if (list) list.push(item);
      else groups.set(folder, [item]);
    }
    const result = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([folder, items]) => ({ folder, items }));
    setLibraryCache(root, result); // cache for an instant library next launch
    return result;
  }

  /** The cached library from the last scan, if it matches the current folder. */
  private getLibraryCached(): LibraryGroup[] {
    const root = getSettings().rootFolder;
    const cache = getLibraryCache();
    if (root && cache && cache.rootFolder === root && Array.isArray(cache.groups)) {
      return cache.groups as LibraryGroup[];
    }
    return [];
  }

  /** Let the user pick the library root folder; persist it and rescan. */
  private async pickFolder(): Promise<LibraryGroup[]> {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths[0]) {
      updateSettings({ rootFolder: result.filePaths[0] });
    }
    return this.getLibrary();
  }

  /** Return a cached cover thumbnail URL for a file, or null if not generated yet. */
  private async getCachedCover(filePath: string): Promise<string | null> {
    const file = path.join(thumbnailCacheDir(), `${hashPath(filePath)}.jpg`);
    try {
      await fs.access(file);
      return coverUrl(file);
    } catch {
      return null;
    }
  }

  /** The source the renderer needs to rasterize a cover (PDF file or first image). */
  private async getCoverSource(filePath: string): Promise<CoverSource | null> {
    const type = detectType(filePath);
    if (!type) return null;
    if (type === 'pdf') return { kind: 'pdf', url: coverUrl(filePath) };
    try {
      const img = await extractFirstImage(filePath, type);
      return img ? { kind: 'image', url: coverUrl(img) } : null;
    } catch {
      return null;
    }
  }

  /** Persist a renderer-generated cover (data URL) to the thumbnail cache. */
  private async saveCover(filePath: string, dataUrl: string): Promise<string | null> {
    const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl);
    if (!match) return null;
    try {
      await fs.mkdir(thumbnailCacheDir(), { recursive: true });
      const file = path.join(thumbnailCacheDir(), `${hashPath(filePath)}.jpg`);
      await fs.writeFile(file, Buffer.from(match[1], 'base64'));
      return coverUrl(file);
    } catch {
      return null;
    }
  }

  /** Source for one page: the comic image file on disk, or a rendered PDF PNG. */
  private pageSource(pageIndex: number, dataUrl: string | null):
    | { kind: 'image'; srcPath: string; ext: string }
    | { kind: 'pdf'; bytes: Buffer; ext: string }
    | null {
    if (!this.session) return null;
    if (dataUrl) {
      const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl);
      if (!match) return null;
      return { kind: 'pdf', bytes: Buffer.from(match[1], 'base64'), ext: '.png' };
    }
    const srcPath = this.session.imagePaths?.[pageIndex];
    if (!srcPath) return null;
    return { kind: 'image', srcPath, ext: path.extname(srcPath) || '.jpg' };
  }

  /** "<Title> - p<N>.<ext>" in the given dir, deduped with " (2)", " (3)", … */
  private async uniquePagePath(dir: string, pageNumber: number, ext: string): Promise<string> {
    const title = this.session?.describe().displayName ?? 'page';
    const safe = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'page';
    const base = `${safe} - p${pageNumber}`;
    let candidate = path.join(dir, `${base}${ext}`);
    for (let n = 2; ; n++) {
      try {
        await fs.access(candidate);
        candidate = path.join(dir, `${base} (${n})${ext}`);
      } catch {
        return candidate; // does not exist → free to use
      }
    }
  }

  /** Save one page to a user-chosen file. Returns true when a file was written. */
  private async savePage(pageIndex: number, dataUrl: string | null): Promise<boolean> {
    const source = this.pageSource(pageIndex, dataUrl);
    if (!source) return false;
    const defaultPath = await this.uniquePagePath(
      app.getPath('pictures'),
      pageIndex + 1,
      source.ext,
    );
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'Image', extensions: [source.ext.replace(/^\./, '')] }],
    });
    if (result.canceled || !result.filePath) return false;
    try {
      if (source.kind === 'image') await fs.copyFile(source.srcPath, result.filePath);
      else await fs.writeFile(result.filePath, source.bytes);
      return true;
    } catch (err) {
      logError('savePage write failed:', err);
      return false;
    }
  }

  /** Print one page via the system print dialog (hidden window shows the image). */
  private async printPage(pageIndex: number, dataUrl: string | null): Promise<void> {
    const source = this.pageSource(pageIndex, dataUrl);
    if (!source) return;
    let imagePath: string;
    if (source.kind === 'image') {
      imagePath = source.srcPath;
    } else {
      const dir = path.join(app.getPath('temp'), 'yogabookreader-print');
      await fs.mkdir(dir, { recursive: true });
      imagePath = path.join(dir, `page-${pageIndex + 1}-${Date.now()}.png`);
      await fs.writeFile(imagePath, source.bytes);
    }
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
    const cleanup = (): void => {
      if (!win.isDestroyed()) win.destroy();
      if (source.kind === 'pdf') void fs.rm(imagePath, { force: true }).catch(() => undefined);
    };
    try {
      await win.loadURL(coverUrl(imagePath)); // correct image mime via the privileged scheme
      win.webContents.print({}, () => cleanup());
    } catch (err) {
      logError('printPage render failed:', err);
      cleanup();
    }
  }

  private async pickFile(): Promise<void> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'cbz', 'cbr'] }],
    });
    log('pickFile: canceled =', result.canceled, 'path =', result.filePaths[0]);
    if (!result.canceled && result.filePaths[0]) {
      await this.openDocument(result.filePaths[0]);
    }
  }

  /** Navigate every window to the splash launcher or the reader page. */
  private navigateAll(page: ReaderPage): void {
    log('navigateAll ->', page, '(', this.windows.length, 'window(s) )');
    for (const { role, window } of this.windows) {
      if (!window.isDestroyed()) loadPage(window, role, page);
    }
  }

  /**
   * Show the splash/library launcher. The session is kept so the user can
   * "Resume reading" (e.g. if they opened the library by accident).
   */
  private openLibraryView(): void {
    this.pendingError = null;
    this.navigateAll('splash');
  }

  /** Push current state to a window once its reader page has (re)loaded. */
  private onRendererReady(sender: Electron.WebContents): void {
    const win = this.windows.find((w) => w.window.webContents === sender);
    if (!win || win.window.isDestroyed()) return;
    log('ready from', win.role, '- session:', !!this.session, 'pendingError:', !!this.pendingError);
    if (this.session) {
      win.window.webContents.send(MainToRenderer.documentLoaded, this.session.describe());
      win.window.webContents.send(MainToRenderer.render, this.session.instructionFor(win.role));
    } else if (this.pendingError) {
      win.window.webContents.send(MainToRenderer.showError, this.pendingError);
    }
  }

  private failOpen(error: ReaderError): void {
    logError('failOpen:', error.reason, '-', error.message);
    this.session = null;
    this.pendingError = error;
    this.navigateAll('reader'); // reader page hosts the error UI
  }

  /** Open a document, building a session and broadcasting it to all windows. */
  async openDocument(filePath: string): Promise<void> {
    log('openDocument:', filePath);
    const token = ++this.openToken;
    const settings = getSettings();
    const fileState = getFileState(filePath);
    const displayMode = currentPlacement().mode === 'dual' ? 'dual' : 'single';

    try {
      const result = await analyzeFile(filePath, settings, fileState, displayMode);
      this.session = result.session;
      this.pendingError = null;
      recordRecentFile({
        filePath,
        displayName: result.displayName,
        lastPage: this.session.anchorPage,
        totalPages: this.session.describe().totalPages,
        lastReadAt: Date.now(),
      });

      // Bring every window to the reader page; each requests content via `ready`.
      this.navigateAll('reader');

      // Refine centerfold / spread-encoded classification off the open path.
      this.broadcastStatus('Analyzing pages…');
      void this.refineInBackground(token, filePath, result.type, result.imagePaths, fileState?.isSpreadEncoded);
    } catch (err) {
      this.failOpen(
        err instanceof FileLoadError
          ? err.error
          : { filePath, reason: 'unknown', message: (err as Error).message },
      );
    }
  }

  /** Run the full page classification and apply it if still the current document. */
  private async refineInBackground(
    token: number,
    filePath: string,
    type: 'pdf' | 'cbz' | 'cbr',
    imagePaths: string[] | undefined,
    override: boolean | undefined,
  ): Promise<void> {
    const result = await refineClassification(filePath, type, imagePaths, override);
    if (result && token === this.openToken && this.session) {
      this.session.setSpreadEncoded(result.isSpreadEncoded, result.pageAspects);
      this.broadcastRender();
    }
    if (token === this.openToken) this.broadcastStatus(null);
  }

  private broadcastStatus(message: string | null): void {
    for (const { window } of this.windows) {
      if (!window.isDestroyed()) window.webContents.send(MainToRenderer.status, message);
    }
  }

  /**
   * Apply a manual spread-encoding override (PRD US#22): persist it and reclassify
   * the open document in-place so pages are re-built without re-reading the file.
   */
  private async setSpreadEncoded(value: boolean | undefined): Promise<void> {
    if (!this.session) return;
    const info = this.session.describe();
    const existing = getFileState(info.filePath);
    saveFileState({
      filePath: info.filePath,
      lastPage: existing?.lastPage ?? this.session.anchorPage,
      readingDirection: existing?.readingDirection ?? this.session.readingDirection,
      zoomPreset: existing?.zoomPreset ?? info.zoomPreset,
      isSpreadEncoded: value,
    });

    // Reclassify in the background without re-reading the file.
    const token = ++this.openToken;
    this.broadcastStatus('Reclassifying pages…');
    const result = await refineClassification(
      info.filePath,
      info.type,
      this.session.imagePaths,
      value,
    );
    if (result && token === this.openToken && this.session) {
      this.session.setSpreadEncoded(result.isSpreadEncoded, result.pageAspects);
      this.persistAndRender();
    }
    if (token === this.openToken) this.broadcastStatus(null);
  }

  /** Phase-nudge the spread pairing from the current page (toggles at that page). */
  private nudgeSpread(): void {
    if (!this.session) return;
    this.session.nudgeSpreadHere();
    this.persistSpreadBreaks();
    this.broadcastRender();
  }

  /** Clear all phase nudges for the open document. */
  private resetSpread(): void {
    if (!this.session) return;
    this.session.resetSpreadBreaks();
    this.persistSpreadBreaks();
    this.broadcastRender();
  }

  /** Persist the current phase nudges per-file (mirrors the isSpreadEncoded override). */
  private persistSpreadBreaks(): void {
    if (!this.session) return;
    const info = this.session.describe();
    saveFileState({
      filePath: info.filePath,
      lastPage: this.session.anchorPage,
      totalPages: info.totalPages,
      readingDirection: info.readingDirection,
      zoomPreset: info.zoomPreset,
      spreadBreaks: this.session.spreadBreaks,
    });
  }

  private toggleDirection(): void {
    if (!this.session) return;
    const next: ReadingDirection = this.session.readingDirection === 'ltr' ? 'rtl' : 'ltr';
    this.session.setReadingDirection(next);
    this.persistAndRender();
  }

  /**
   * Re-evaluate the display layout after a screen change (US#26). When the
   * topology is unchanged this just refreshes the spread layout (cheap — these
   * events fire often). When it changes (single↔dual, e.g. rotating into book
   * posture), the windows are rebuilt so the second screen actually appears.
   */
  relayout(): void {
    const desired: DisplayMode = currentPlacement().mode === 'dual' ? 'dual' : 'single';
    const current: DisplayMode = this.windows.length >= 2 ? 'dual' : 'single';
    if (desired === current) {
      if (this.session) {
        this.session.setDisplayMode(desired);
        this.broadcastRender();
      }
      return;
    }
    log('relayout: topology change', current, '->', desired, '- rebuilding windows');
    this.rebuildWindows(desired);
  }

  /**
   * Tear down the current windows and create a fresh set for the new topology.
   * New windows are created before the old ones are destroyed so the window count
   * never hits zero (which would trigger app quit).
   */
  private rebuildWindows(mode: DisplayMode): void {
    this.rebuilding = true;
    try {
      const old = this.windows;
      this.windows = this.windowFactory();
      for (const { window } of old) {
        if (!window.isDestroyed()) window.destroy();
      }
    } finally {
      this.rebuilding = false;
    }
    if (this.session) {
      this.session.setDisplayMode(mode);
      this.navigateAll('reader'); // freshly-created windows pull content via `ready`
    }
    // No document open: the new windows already booted to the splash launcher.
  }

  /** Toggle full-screen on every window and report the new state to the overlay. */
  private toggleFullScreen(): void {
    const anchor = this.windows[0]?.window;
    if (!anchor) return;
    const next = !anchor.isFullScreen();
    for (const { window } of this.windows) {
      if (!window.isDestroyed()) window.setFullScreen(next);
    }
    for (const { window } of this.windows) {
      if (!window.isDestroyed()) window.webContents.send(MainToRenderer.fullScreenChanged, next);
    }
  }

  private persistAndRender(): void {
    if (this.session) {
      const info = this.session.describe();
      saveFileState({
        filePath: info.filePath,
        lastPage: this.session.anchorPage,
        totalPages: info.totalPages,
        readingDirection: info.readingDirection,
        zoomPreset: info.zoomPreset,
        isSpreadEncoded: info.isSpreadEncoded,
      });
      // Keep the recent entry's progress in step with where the reader is now.
      recordRecentFile({
        filePath: info.filePath,
        displayName: info.displayName,
        lastPage: this.session.anchorPage,
        totalPages: info.totalPages,
        lastReadAt: Date.now(),
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

