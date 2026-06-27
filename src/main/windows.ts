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
import { assignDisplays, type DisplayInfo, type Placement } from '../core/placement.js';
import type { WindowRole } from '../shared/ipc.js';
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
  log('placement mode =', placement.mode, '- displays:', screen.getAllDisplays().length);

  if (placement.mode === 'dual') {
    return [
      { role: 'left', window: createWindow('left', placement.left.bounds, windowed) },
      { role: 'right', window: createWindow('right', placement.right.bounds, windowed) },
    ];
  }

  if (placement.mode === 'single') {
    return [
      { role: 'single', window: createWindow('single', placement.display.bounds, windowed) },
    ];
  }

  // Ambiguous: open a single window on the primary display; the renderer can show
  // the tap-to-identify UI. Use the primary display's bounds.
  const primary = screen.getPrimaryDisplay();
  return [{ role: 'single', window: createWindow('single', primary.bounds, windowed) }];
}
