/**
 * Reader window entry point. Wires the main-process render stream to the canvas,
 * touch navigation, the control overlay (right/single window only) and the error
 * page. The window learns its role (left/right/single) from the URL query set by
 * the main process when the window was created.
 */

import { resolveTarget, paintSource, clearCanvas, prefetch, resetCaches, renderPdfPagePng } from './render-engine.js';
import { attachNavigation } from './touch.js';
import { ControlOverlay } from './overlay.js';
import { HelpOverlay } from './help.js';
import { showError } from './error.js';
import { showPageMenu } from './page-menu.js';
import { setStatus } from './toast.js';
import type { RenderInstruction, RenderTarget, WindowRole } from '../shared/ipc.js';
import { DEFAULT_SETTINGS, type ZoomPreset } from '../core/types.js';
import type { ResolvedSource } from './render-engine.js';

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
  const loadingEl = document.getElementById('loading');
  setupCanvas(canvas);

  const reader = window.reader;
  let totalPages = 0;
  let zoomPreset: ZoomPreset = DEFAULT_SETTINGS.defaultZoomPreset;
  let currentFilePath: string | null = null;
  // The page shown in THIS window right now (per-role slot), for the page menu.
  let currentTarget: RenderTarget | null = null;
  // Monotonic token so a slow async resolve from an earlier render can't paint
  // over a newer one during rapid page turns.
  let renderSeq = 0;

  // App-level brightness dim layer (fallback when hardware control is unavailable).
  const dimLayer = document.createElement('div');
  dimLayer.className = 'dim-layer';
  document.body.appendChild(dimLayer);

  const settings = await reader.getSettings().catch(() => DEFAULT_SETTINGS);

  // The help diagram exists on every window (shown on both screens on request);
  // the control overlay lives only on the right (or single) window.
  const help = new HelpOverlay(() => reader.dismissHelp());
  const overlay =
    role === 'left'
      ? null
      : new ControlOverlay(
          {
            onPrev: () => reader.prev(),
            onNext: () => reader.next(),
            onJump: (p) => reader.jumpToPage(p),
            onToggleDirection: () => reader.toggleDirection(),
            onSetZoom: (preset) => reader.setZoomPreset(preset),
            onNudgeSpread: () => reader.nudgeSpread(),
            onResetSpread: () => reader.resetSpread(),
            onOpenLibrary: () => reader.openLibrary(),
            onToggleFullScreen: () => reader.toggleFullScreen(),
            onQuit: () => reader.quit(),
            onSetBrightness: (level) => reader.setBrightness(level),
            onToggleAdaptive: (disabled) => reader.setAdaptiveBrightnessDisabled(disabled),
            onShowHelp: () => reader.requestHelp(), // show on BOTH screens via main
          },
          settings.brightness,
          settings.disableAdaptiveBrightness,
        );

  // Long-press the centre of either screen to save/print the page shown there.
  // For PDFs the renderer rasterizes the page to a PNG; comics are copied by main.
  async function pageDataUrl(target: RenderTarget): Promise<string | null> {
    return target.kind === 'pdf' ? renderPdfPagePng(target.filePath, target.pageIndex) : null;
  }
  function openPageMenu(): void {
    const target = currentTarget;
    if (!target || target.kind === 'blank') return; // nothing on this slot (e.g. cover's blank side)
    const pageIndex = target.pageIndex;
    showPageMenu(pageIndex + 1, {
      onSave: () => {
        setStatus('Saving page…');
        void pageDataUrl(target)
          .then((dataUrl) => reader.savePage(pageIndex, dataUrl))
          .then((saved) => {
            setStatus(saved ? `Saved page ${pageIndex + 1}.` : null);
            if (saved) setTimeout(() => setStatus(null), 1800);
          })
          .catch(() => setStatus(null));
      },
      onPrint: () => {
        void pageDataUrl(target)
          .then((dataUrl) => reader.printPage(pageIndex, dataUrl))
          .catch(() => undefined);
      },
    });
  }

  attachNavigation(
    stage,
    {
      onNext: () => reader.next(),
      onPrev: () => reader.prev(),
      onCenter: () => reader.requestOverlay(),
      onDoubleTap: () => overlay?.cycleZoom(),
      onLongPrev: () => reader.jumpToPage(0),
      onLongNext: () => reader.jumpToPage(totalPages > 0 ? totalPages - 1 : 0),
      onLongCenter: () => openPageMenu(),
    },
    { tapZoneWidth: settings.tapZoneWidth, edgeDeadZone: settings.edgeDeadZone },
  );

  let helpAutoShown = settings.helpShown;

  reader.onInit(() => {
    /* role already read from the query; init reserved for future use */
  });

  reader.onDocumentLoaded((info) => {
    totalPages = info.totalPages;
    zoomPreset = info.zoomPreset;
    overlay?.setBookTitle(info.displayName);
    // Free the previous document's cached pages when switching files.
    if (currentFilePath !== null && currentFilePath !== info.filePath) resetCaches();
    currentFilePath = info.filePath;
    // Show the tap-zone help once, on the first document ever opened. Trigger
    // from the primary window only; main broadcasts it to both screens.
    if (!helpAutoShown && role !== 'left') {
      helpAutoShown = true;
      reader.requestHelp();
    }
  });

  // Resolve with a couple of retries so a transient decode/IPC hiccup on one
  // screen doesn't leave it stuck on the previous page (two-window desync).
  async function resolveWithRetry(
    instruction: RenderInstruction,
    attempts = 3,
  ): Promise<ResolvedSource | null> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await resolveTarget(instruction.current, canvas.height);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 120 * (i + 1)));
      }
    }
    throw lastErr;
  }

  reader.onRender((instruction) => {
    zoomPreset = instruction.zoomPreset;
    currentTarget = instruction.current;
    overlay?.setProgress(instruction.pages, totalPages);
    overlay?.setActiveZoom(instruction.zoomPreset);
    prefetch(instruction.prefetch, canvas.height);
    const token = ++renderSeq;
    resolveWithRetry(instruction)
      .then((resolved) => {
        if (token !== renderSeq) return; // a newer render superseded this one
        if (resolved) paintSource(canvas, resolved, zoomPreset);
        else clearCanvas(canvas);
        loadingEl?.classList.add('hidden'); // first paint done
      })
      .catch((err) => {
        console.error('render failed, re-syncing:', err);
        // Pull the authoritative current spread again so the screens re-align.
        if (token === renderSeq) reader.ready();
      });
  });

  reader.onShowError((error) => {
    loadingEl?.classList.add('hidden');
    showError(stage, error, {
      onPickFile: () => reader.pickFile(),
      onRemoveRecent: (filePath) => {
        reader.removeRecentFile(filePath);
        reader.openLibrary();
      },
    });
  });
  reader.onShowOverlay(() => overlay?.show());
  reader.onShowHelp(() => help.show());
  reader.onHideHelp(() => help.hide());
  reader.onStatus((message) => setStatus(message));
  reader.onFullScreenChanged((_isFs) => { /* full-screen state tracked by main process; Esc key toggles */ });
  reader.onSetDim((level) => {
    dimLayer.style.opacity = level === null ? '0' : String((100 - level) / 100);
  });

  // Keyboard: Escape toggles full-screen, Ctrl+Q quits.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') reader.toggleFullScreen();
    else if (e.key.toLowerCase() === 'q' && (e.ctrlKey || e.metaKey)) reader.quit();
  });

  // Re-sync this window's spread whenever it regains focus/visibility, healing
  // any drift between the two screens.
  window.addEventListener('focus', () => reader.ready());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reader.ready();
  });

  // Debounce resize so a burst of events triggers a single re-render.
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setupCanvas(canvas);
      reader.ready(); // re-request the current spread at the new size
    }, 150);
  });

  reader.ready();
}

void main();
