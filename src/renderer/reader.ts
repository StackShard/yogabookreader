/**
 * Reader window entry point. Wires the main-process render stream to the canvas,
 * touch navigation, the control overlay (right/single window only) and the error
 * page. The window learns its role (left/right/single) from the URL query set by
 * the main process when the window was created.
 */

import { resolveTarget, paintSource, clearCanvas, prefetch, resetCaches } from './render-engine.js';
import { attachNavigation } from './touch.js';
import { ControlOverlay } from './overlay.js';
import { showError } from './error.js';
import type { WindowRole } from '../shared/ipc.js';
import { DEFAULT_SETTINGS } from '../core/types.js';

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role');
  return role === 'left' || role === 'right' || role === 'single' ? role : 'single';
}

function setupCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

async function main(): Promise<void> {
  const role = readRole();
  const stage = document.getElementById('stage') as HTMLElement;
  const canvas = document.getElementById('page') as HTMLCanvasElement;
  setupCanvas(canvas);

  const reader = window.reader;
  let spreadCount = 0;
  let zoomPreset = DEFAULT_SETTINGS.defaultZoomPreset;
  let currentFilePath: string | null = null;
  // Monotonic token so a slow async resolve from an earlier render can't paint
  // over a newer one during rapid page turns.
  let renderSeq = 0;

  // The overlay lives only in the right window (or the single-window fallback).
  const overlay =
    role === 'left'
      ? null
      : new ControlOverlay({
          onPrev: () => reader.prev(),
          onNext: () => reader.next(),
          onJump: (p) => reader.jumpToPage(p),
          onToggleDirection: () => reader.toggleDirection(),
          onSetZoom: (preset) => reader.setZoomPreset(preset),
          onOpenLibrary: () => reader.openLibrary(),
          onToggleFullScreen: () => reader.toggleFullScreen(),
          onQuit: () => reader.quit(),
        });

  const settings = await reader.getSettings().catch(() => DEFAULT_SETTINGS);

  attachNavigation(
    stage,
    {
      onNext: () => reader.next(),
      onPrev: () => reader.prev(),
      onCenter: () => reader.requestOverlay(),
    },
    { tapZoneWidth: settings.tapZoneWidth },
  );

  reader.onInit(() => {
    /* role already read from the query; init reserved for future use */
  });

  reader.onDocumentLoaded((info) => {
    spreadCount = info.spreadCount;
    zoomPreset = info.zoomPreset;
    // Free the previous document's cached pages when switching files.
    if (currentFilePath !== null && currentFilePath !== info.filePath) resetCaches();
    currentFilePath = info.filePath;
  });

  reader.onRender((instruction) => {
    zoomPreset = instruction.zoomPreset;
    overlay?.setCounter(instruction.spreadIndex, spreadCount);
    prefetch(instruction.prefetch);
    const token = ++renderSeq;
    resolveTarget(instruction.current, canvas.height)
      .then((resolved) => {
        if (token !== renderSeq) return; // a newer render superseded this one
        if (resolved) paintSource(canvas, resolved, zoomPreset);
        else clearCanvas(canvas);
      })
      .catch((err) => console.error('render failed:', err));
  });

  reader.onShowError((error) => showError(stage, error));
  reader.onShowOverlay(() => overlay?.show());
  reader.onFullScreenChanged((isFs) => overlay?.setFullScreenState(isFs));

  // Keyboard: Escape toggles full-screen, Ctrl+Q quits.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') reader.toggleFullScreen();
    else if (e.key.toLowerCase() === 'q' && (e.ctrlKey || e.metaKey)) reader.quit();
  });

  window.addEventListener('resize', () => {
    setupCanvas(canvas);
    // Re-request the current spread so it repaints at the new size.
    reader.ready();
  });

  reader.ready();
}

void main();
