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
import { detectType } from './file-loader.js';
import { registerFileProtocol, registerPrivilegedScheme } from './protocol.js';
import { log } from './log.js';

/** First supported document path in a command line (file association / "Open with"). */
function fileArgFrom(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('-') && detectType(arg)) return arg;
  }
  return null;
}

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
  // Create fullscreen windows immediately so the splash screen is visible before
  // the first synchronous state.json read (which can take several seconds for a
  // large library with hundreds of files). If the user has persisted windowed
  // mode, the windows are rebuilt once settings load — a brief flicker, but it
  // avoids a ~20s blank launch when state.json is large or disk I/O is slow.
  const windows = createReaderWindows(/* windowed */ false);
  controller.setWindows(windows);
  // Settings are now read from the already-cached state if been read before, or
  // synchronously loaded from disk on first access. Either way, the window is
  // already on screen.
  if (getSettings().windowedMode) {
    controller.setWindows(createReaderWindows(/* windowed */ true));
  }
}

app.whenReady().then(async () => {
  log('app ready, node', process.versions.node, 'electron', process.versions.electron);
  registerFileProtocol();
  // Remove any temp files left by a previous crash (PRD Further Notes). Fired
  // without awaiting so a large leftover temp dir (e.g. after several crashes)
  // can't delay the window from appearing — cleanupStaleTemp snapshots entries
  // before deleting, so it can't race a concurrent extraction into a new dir.
  void cleanupStaleTemp().catch((err) => log('cleanupStaleTemp failed:', (err as Error).message));

  controller.registerHandlers();
  bootWindows();
  void controller.applyStoredBrightness();

  // Launched with a document (file association / drag onto the .exe): open it.
  const startupFile = fileArgFrom(process.argv);
  if (startupFile) void controller.openDocument(startupFile);

  // A second launch used to die silently (README FAQ). Focus the running app
  // instead, and open a document if the second launch carried one.
  app.on('second-instance', (_e, argv) => {
    log('second-instance:', argv.join(' '));
    const windows = controller.allWindows();
    for (const win of windows) {
      if (win.isMinimized()) win.restore();
    }
    windows[0]?.focus();
    const file = fileArgFrom(argv);
    if (file) void controller.openDocument(file);
  });

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
  // Clean the comic temp directory and restore Windows adaptive brightness on exit.
  event.preventDefault();
  try {
    await controller.restoreAdaptiveBrightness();
    await cleanupAllTemp();
  } catch (err) {
    log('cleanup on quit failed:', (err as Error).message);
  } finally {
    app.exit(0);
  }
});
