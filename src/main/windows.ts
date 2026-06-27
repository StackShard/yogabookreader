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

export interface ReaderWindow {
  role: WindowRole;
  window: BrowserWindow;
}

const PRELOAD = path.join(__dirname, '../preload/preload.js');
const RENDERER_HTML = path.join(__dirname, '../renderer/index.html');

function toDisplayInfo(d: Electron.Display): DisplayInfo {
  return { id: d.id, bounds: d.bounds };
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
  // In `electron-vite dev` the renderer is served from a dev server whose URL is
  // exposed here; packaged/preview builds load the bundled HTML from disk.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(`${devUrl}/index.html?role=${role}`);
  } else {
    void win.loadFile(RENDERER_HTML, { query: { role } });
  }
  return win;
}

/**
 * Create the reader windows for the current display layout.
 * Returns the windows tagged with their role so the IPC layer can target them.
 */
export function createReaderWindows(windowed = false): ReaderWindow[] {
  const placement = currentPlacement();

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
