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
// The controller rebuilds windows itself on layout changes, so give it a factory.
controller.setWindowFactory(() => createReaderWindows(getSettings().windowedMode));

function bootWindows(): void {
  controller.setWindows(createReaderWindows(getSettings().windowedMode));
}

app.whenReady().then(async () => {
  log('app ready, node', process.versions.node, 'electron', process.versions.electron);
  registerFileProtocol();
  // Remove any temp files left by a previous crash (PRD Further Notes).
  await cleanupStaleTemp();

  controller.registerHandlers();
  bootWindows();
  controller.applyStoredBrightness();

  // Survive docking/undocking and posture changes: re-evaluate the layout.
  screen.on('display-added', () => controller.relayout());
  screen.on('display-removed', () => controller.relayout());
  screen.on('display-metrics-changed', () => controller.relayout());

  app.on('activate', () => {
    if (controller.allWindows().length === 0) bootWindows();
  });
});

app.on('window-all-closed', () => {
  // Don't quit while windows are being torn down and recreated for a layout change.
  if (controller.isRebuilding) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', async (event) => {
  // Clean the comic temp directory on exit (PRD §Rendering "CBZ/CBR").
  event.preventDefault();
  try {
    await cleanupAllTemp();
  } catch (err) {
    log('temp cleanup on quit failed:', (err as Error).message);
  } finally {
    app.exit(0);
  }
});
