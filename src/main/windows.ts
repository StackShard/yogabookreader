/**
 * Dual-window management (PRD §Screen Topology, §Window Chrome, US#9/#26).
 *
 * Creates one frameless, full-screen BrowserWindow per Yoga Book screen, placed
 * using the pure {@link assignDisplays} heuristic. Falls back to a single window
 * when only one display is present (folded device). Re-evaluates placement on
 * display connect/disconnect so docking/undocking is survivable.
 */

import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { assignDisplays, isSingleLandscape, type DisplayInfo, type Placement } from '../core/placement.js';
import type { DisplayMode } from '../core/types.js';
import type { WindowRole } from '../shared/ipc.js';
import { getSettings } from './state-store.js';
import { log } from './log.js';

export interface ReaderWindow {
  role: WindowRole;
  window: BrowserWindow;
}

/** Which HTML document a window is showing. */
export type ReaderPage = 'splash' | 'reader';

const PRELOAD = path.join(__dirname, '../preload/preload.js');

function toDisplayInfo(d: Electron.Display): DisplayInfo {
  return { id: d.id, bounds: d.bounds };
}

/**
 * Load a page (splash launcher or reader) into a window, carrying its role.
 * Uses the electron-vite dev server URL in development and the bundled HTML in
 * packaged/preview builds.
 */
export function loadPage(win: BrowserWindow, role: WindowRole, page: ReaderPage): void {
  const file = page === 'splash' ? 'splash.html' : 'index.html';
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    const url = `${devUrl}/${file}?role=${role}`;
    log('loadPage:', role, '->', url);
    void win.loadURL(url);
  } else {
    const filePath = path.join(__dirname, `../renderer/${file}`);
    log('loadPage:', role, '->', filePath, `(role=${role})`);
    void win.loadFile(filePath, { query: { role } });
  }
}

export function currentPlacement(): Placement {
  return assignDisplays(screen.getAllDisplays().map(toDisplayInfo));
}

/**
 * The effective reading mode for the current displays + user settings:
 * - `dual` — two portrait screens in book posture.
 * - `single-twoup` — one landscape screen with the two-up setting on: a
 *   side-by-side spread in a single window.
 * - `single` — one portrait screen, or two-up disabled: one page at a time.
 */
export function effectiveDisplayMode(): DisplayMode {
  const placement = currentPlacement();
  if (placement.mode === 'dual') return 'dual';
  if (isSingleLandscape(placement) && getSettings().landscapeTwoUp) return 'single-twoup';
  return 'single';
}

function createWindow(role: WindowRole, bounds: DisplayInfo['bounds'], windowed: boolean): BrowserWindow {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: windowed, // borderless in reading mode (PRD §Window Chrome)
    fullscreen: !windowed,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // Surface renderer console output and load failures in the terminal to aid
  // diagnosis on the device.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load:', role, code, desc, url);
  });
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    log(`renderer[${role}] ${source}:${line}: ${message}`, `(level ${level})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log('render-process-gone:', role, details.reason);
  });

  // Boot into the splash/library launcher so there is an obvious entry point;
  // the main process navigates windows to the reader when a document opens.
  loadPage(win, role, 'splash');
  return win;
}

/**
 * Create the reader windows for the current display layout.
 * Returns the windows tagged with their role so the IPC layer can target them.
 */
export function createReaderWindows(windowed = false): ReaderWindow[] {
  const placement = currentPlacement();
  const mode = effectiveDisplayMode();
  log('placement =', placement.mode, 'effective =', mode, '- displays:', screen.getAllDisplays().length);

  if (placement.mode === 'dual') {
    return [
      { role: 'left', window: createWindow('left', placement.left.bounds, windowed) },
      { role: 'right', window: createWindow('right', placement.right.bounds, windowed) },
    ];
  }

  // One physical display. `twoup` paints both pages side-by-side on a landscape
  // screen; `single` shows one page. Ambiguous → primary display, single-page.
  const bounds =
    placement.mode === 'single' ? placement.display.bounds : screen.getPrimaryDisplay().bounds;
  const role: WindowRole = mode === 'single-twoup' ? 'twoup' : 'single';
  return [{ role, window: createWindow(role, bounds, windowed) }];
}
