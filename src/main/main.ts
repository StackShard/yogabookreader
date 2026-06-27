/**
 * Application entry point (PRD §Multi-Window Architecture, §Packaging, US#9).
 *
 * Boots a single main process that owns both reader windows and the open
 * document. Handles single-instance, temp cleanup (incl. crash recovery), and
 * display connect/disconnect events.
 */

import { app, screen } from 'electron';
import { ReaderController } from './ipc.js';
import { createReaderWindows } from './windows.js';
import { getSettings } from './state-store.js';
import { cleanupAllTemp, cleanupStaleTemp } from './cbz-extractor.js';
import { registerFileProtocol, registerPrivilegedScheme } from './protocol.js';
import { log } from './log.js';

// Enforce a single instance so both windows share one main process & state.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Must run before the app is ready.
registerPrivilegedScheme();

const controller = new ReaderController();

function bootWindows(): void {
  const windowed = getSettings().windowedMode;
  controller.setWindows(createReaderWindows(windowed));
}

app.whenReady().then(async () => {
  log('app ready, node', process.versions.node, 'electron', process.versions.electron);
  registerFileProtocol();
  // Remove any temp files left by a previous crash (PRD Further Notes).
  await cleanupStaleTemp();

  controller.registerHandlers();
  bootWindows();

  // Survive docking/undocking: re-evaluate the display layout.
  screen.on('display-added', () => controller.refreshDisplayMode());
  screen.on('display-removed', () => controller.refreshDisplayMode());
  screen.on('display-metrics-changed', () => controller.refreshDisplayMode());

  app.on('activate', () => {
    if (controller.allWindows().length === 0) bootWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', async (event) => {
  // Clean the comic temp directory on exit (PRD §Rendering "CBZ/CBR").
  event.preventDefault();
  await cleanupAllTemp();
  app.exit(0);
});
