/**
 * IPC controller (PRD §Multi-Window Architecture).
 *
 * Owns the open {@link ReaderSession} and the reader windows, registers all
 * renderer→main handlers, and broadcasts per-window render instructions. The
 * main process is the single source of truth; both windows are kept in lockstep.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  DEFAULT_SETTINGS,
  type AspectClass,
  type DisplayMode,
  type ReadingDirection,
  type ZoomPreset,
} from '../core/types.js';
import {
  MainToRenderer,
  RendererToMain,
  type CoverSource,
  type LibraryGroup,
  type LibraryItemView,
  type ReaderError,
  type RecentFileView,
  type ResumeInfo,
} from '../shared/ipc.js';
import {
  detectType,
  loadComicImages,
  classifyComicImages,
  FileLoadError,
} from './file-loader.js';
import { loadPdfPageCount, classifyPdf } from './pdf-meta.js';
import { ReaderSession } from './session.js';
import { scanFolder, thumbnailCacheDir } from './library-scanner.js';
import { extractFirstImage, hashPath } from './cbz-extractor.js';
import { fileUrl as coverUrl } from './protocol.js';
import { currentPlacement, loadPage, type ReaderPage, type ReaderWindow } from './windows.js';
import { log, logError } from './log.js';
import {
  clearRecentFiles,
  getFileState,
  getLibraryCache,
  getRecentFiles,
  getSettings,
  recordRecentFile,
  saveFileState,
  setLibraryCache,
  updateSettings,
} from './state-store.js';
import { setAdaptiveBrightness, setHardwareBrightness } from './brightness.js';

export class ReaderController {
  private session: ReaderSession | null = null;
  private pendingError: ReaderError | null = null;
  private windows: ReaderWindow[] = [];
  private windowFactory: () => ReaderWindow[] = () => [];
  private rebuilding = false;
  /** Incremented per open; guards background classification against stale applies. */
  private openToken = 0;

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
    ipcMain.on(RendererToMain.requestOverlay, () => this.showOverlay());
    ipcMain.on(RendererToMain.openLibrary, () => this.openLibraryView());
    ipcMain.on(RendererToMain.toggleFullScreen, () => this.toggleFullScreen());
    ipcMain.on(RendererToMain.quit, () => app.quit());

    ipcMain.handle(RendererToMain.getRecentFiles, (): RecentFileView[] =>
      getRecentFiles().map((f) => ({
        filePath: f.filePath,
        displayName: f.displayName,
        lastPage: f.lastPage,
        lastReadAt: f.lastReadAt,
        coverThumbnailPath: f.coverThumbnailPath,
      })),
    );
    ipcMain.on(RendererToMain.clearRecentFiles, () => {
      clearRecentFiles();
    });
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

  /** Return from the library to the current document without reloading it. */
  private resume(): void {
    if (this.session) this.navigateAll('reader');
  }

  /**
   * Apply a brightness level (PRD §Settings): persist it, try the real hardware
   * backlight, and tell the renderers whether to apply the dim-overlay fallback.
   */
  private async setBrightness(level: number): Promise<void> {
    const clamped = Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, Math.round(level)));
    updateSettings({ brightness: clamped });
    const ok = await setHardwareBrightness(clamped);
    // null clears any dim overlay (hardware handled it); otherwise dim in-app.
    const dim = ok ? null : clamped;
    for (const { window } of this.windows) {
      if (!window.isDestroyed()) window.webContents.send(MainToRenderer.setDim, dim);
    }
  }

  /**
   * Apply persisted brightness settings at startup: optionally disable Windows
   * adaptive brightness (so it can't override the manual level), then set it.
   */
  async applyStoredBrightness(): Promise<void> {
    const settings = getSettings();
    if (settings.disableAdaptiveBrightness) await setAdaptiveBrightness(false);
    await this.setBrightness(settings.brightness);
  }

  /** Toggle disabling of Windows adaptive brightness (persisted). */
  private async setAdaptiveBrightnessDisabled(disabled: boolean): Promise<void> {
    updateSettings({ disableAdaptiveBrightness: disabled });
    // disabled => turn adaptive OFF; enabled again => turn it back ON.
    await setAdaptiveBrightness(!disabled);
    if (disabled) await this.setBrightness(getSettings().brightness);
  }

  /** Restore Windows adaptive brightness (call on quit). */
  async restoreAdaptiveBrightness(): Promise<void> {
    if (getSettings().disableAdaptiveBrightness) await setAdaptiveBrightness(true);
  }

  /** Scanned library grouped into one section per sub-folder. */
  private async getLibrary(): Promise<LibraryGroup[]> {
    const root = getSettings().rootFolder;
    if (!root) return [];
    const entries = await scanFolder(root);
    const groups = new Map<string, LibraryItemView[]>();
    for (const e of entries) {
      const folder = e.relativeDir === '' ? 'Library' : e.relativeDir;
      const item: LibraryItemView = { filePath: e.filePath, displayName: e.displayName, type: e.type };
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
    const type = detectType(filePath);
    log('openDocument:', filePath, 'type =', type);
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
    // Always open at the code default (Fit Width); ignore stale persisted zoom so
    // the default reliably wins. The overlay buttons still change it per session.
    const zoomPreset = DEFAULT_SETTINGS.defaultZoomPreset;
    const override = fileState?.isSpreadEncoded;
    const displayMode = currentPlacement().mode === 'dual' ? 'dual' : 'single';
    const displayName = path.basename(filePath, path.extname(filePath));
    const token = ++this.openToken;

    // Fast path: get just what's needed to open (page count for PDF, extracted
    // images for comics). The expensive per-page classification runs in the
    // background so the document appears immediately.
    let totalPages: number;
    let imagePaths: string[] | undefined;
    try {
      if (type === 'pdf') {
        totalPages = await loadPdfPageCount(filePath);
      } else {
        imagePaths = await loadComicImages(filePath, type);
        totalPages = imagePaths.length;
      }
    } catch (err) {
      this.failOpen(
        err instanceof FileLoadError
          ? err.error
          : { filePath, reason: 'unknown', message: (err as Error).message },
      );
      return;
    }

    const provisional = provisionalClassification(totalPages, override);
    this.session = new ReaderSession({
      filePath,
      displayName,
      type,
      pdfPath: type === 'pdf' ? filePath : undefined,
      imagePaths,
      totalPages,
      pageAspects: provisional.pageAspects,
      isSpreadEncoded: provisional.isSpreadEncoded,
      readingDirection,
      zoomPreset,
      displayMode,
      startPage: fileState?.lastPage,
    });
    this.pendingError = null;
    log('opened (provisional):', totalPages, 'pages, mode =', displayMode);
    recordRecentFile({ filePath, displayName, lastPage: this.session.anchorPage, lastReadAt: Date.now() });

    // Bring every window to the reader page; each requests content via `ready`.
    this.navigateAll('reader');

    // Refine centerfold / spread-encoded classification off the open path.
    this.broadcastStatus('Analyzing pages…');
    void this.classifyInBackground(token, filePath, type, imagePaths, override);
  }

  /** Run the full page classification and apply it if still the current document. */
  private async classifyInBackground(
    token: number,
    filePath: string,
    type: 'pdf' | 'cbz' | 'cbr',
    imagePaths: string[] | undefined,
    override: boolean | undefined,
  ): Promise<void> {
    try {
      const result =
        type === 'pdf'
          ? await classifyPdf(filePath, override)
          : await classifyComicImages(imagePaths ?? [], override);
      if (token !== this.openToken || !this.session) return; // superseded
      this.session.setSpreadEncoded(result.isSpreadEncoded, result.pageAspects);
      this.broadcastRender();
    } catch (err) {
      logError('background classify failed:', (err as Error).message);
    } finally {
      if (token === this.openToken) this.broadcastStatus(null);
    }
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
    try {
      const result =
        info.type === 'pdf'
          ? await classifyPdf(info.filePath, value)
          : await classifyComicImages(this.session.imagePaths ?? [], value);
      if (token !== this.openToken || !this.session) return;
      this.session.setSpreadEncoded(result.isSpreadEncoded, result.pageAspects);
      this.persistAndRender();
    } catch (err) {
      logError('reclassify failed:', (err as Error).message);
    } finally {
      if (token === this.openToken) this.broadcastStatus(null);
    }
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

/**
 * A provisional classification used to open instantly: honour a saved
 * spread-encoded override, otherwise treat every page as a normal single page
 * (refined by the background pass).
 */
function provisionalClassification(
  totalPages: number,
  override: boolean | undefined,
): { pageAspects: AspectClass[]; isSpreadEncoded: boolean } {
  const spread = override === true;
  return {
    isSpreadEncoded: spread,
    pageAspects: Array.from({ length: totalPages }, () =>
      spread ? ('spread-encoded' as AspectClass) : ('single' as AspectClass),
    ),
  };
}
