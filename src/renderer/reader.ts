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
import { setProgress, setStatus, toast } from './toast.js';
import type { RenderTarget, WindowRole } from '../shared/ipc.js';
import {
  DEFAULT_SETTINGS,
  nextZoomPreset,
  type ReadingDirection,
  type ZoomPreset,
} from '../core/types.js';
import type { ResolvedSource } from './render-engine.js';

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role');
  return role === 'left' || role === 'right' || role === 'single' || role === 'twoup'
    ? role
    : 'single';
}

/** Size a canvas's backing store to the given CSS dimensions at device pixel ratio. */
function setupCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
}

async function main(): Promise<void> {
  const role = readRole();
  const twoUp = role === 'twoup';
  const stage = document.getElementById('stage') as HTMLElement;
  const canvas = document.getElementById('page') as HTMLCanvasElement;
  // Landscape two-up: this one window paints both pages of the spread into two
  // side-by-side canvases (left page | right page).
  const rightCanvas = document.getElementById('page-right') as HTMLCanvasElement;
  const loadingEl = document.getElementById('loading');

  // Size the canvas backing store(s) for the current mode: full window for one
  // page, two equal halves for two-up.
  const sizeCanvases = (): void => {
    if (twoUp) {
      setupCanvas(canvas, window.innerWidth / 2, window.innerHeight);
      setupCanvas(rightCanvas, window.innerWidth / 2, window.innerHeight);
    } else {
      setupCanvas(canvas, window.innerWidth, window.innerHeight);
    }
  };
  if (twoUp) {
    stage.classList.add('twoup');
    rightCanvas.hidden = false;
  }
  sizeCanvases();

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
  // Tracked live (documentLoaded + every render) so touch/key mapping and the
  // help diagram follow the ↔ LTR/RTL toggle.
  let readingDirection: ReadingDirection = settings.defaultReadingDirection;

  // The two-up toggle is offered only on a single landscape screen.
  const layout = await reader.getLayoutInfo().catch(() => null);

  // The help diagram exists on every window (shown on both screens on request);
  // the control overlay lives only on the right (or single/twoup) window.
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
            onToggleTwoUp: (enabled) => reader.setLandscapeTwoUp(enabled),
            onShowHelp: () => reader.requestHelp(), // show on BOTH screens via main
          },
          settings.brightness,
          settings.disableAdaptiveBrightness,
          {
            showTwoUp: layout?.isSingleLandscape ?? false,
            twoUpEnabled: layout?.landscapeTwoUp ?? DEFAULT_SETTINGS.landscapeTwoUp,
          },
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
          .then((result) => {
            setStatus(null);
            if (result === 'saved') toast(`Saved page ${pageIndex + 1}.`);
            else if (result === 'failed') toast('Could not save page');
            // 'canceled': the user changed their mind — nothing to report.
          })
          .catch(() => {
            setStatus(null);
            toast('Could not save page');
          });
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
      // Handled here (not via the overlay) so it works on the left screen too.
      onDoubleTap: () => reader.setZoomPreset(nextZoomPreset(zoomPreset)),
      onLongPrev: () => reader.jumpToPage(0),
      onLongNext: () => reader.jumpToPage(totalPages > 0 ? totalPages - 1 : 0),
      onLongCenter: () => openPageMenu(),
    },
    {
      tapZoneWidth: settings.tapZoneWidth,
      edgeDeadZone: settings.edgeDeadZone,
      getDirection: () => readingDirection,
    },
  );

  let helpAutoShown = settings.helpShown;

  reader.onInit(() => {
    /* role already read from the query; init reserved for future use */
  });

  reader.onDocumentLoaded((info) => {
    totalPages = info.totalPages;
    zoomPreset = info.zoomPreset;
    readingDirection = info.readingDirection;
    help.setDirection(readingDirection);
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

  // Resolve one target with a couple of retries so a transient decode/IPC
  // hiccup doesn't leave a canvas stuck on the previous page.
  async function resolveWithRetry(
    target: RenderTarget,
    targetHeight: number,
    attempts = 3,
  ): Promise<ResolvedSource | null> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await resolveTarget(target, targetHeight);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 120 * (i + 1)));
      }
    }
    throw lastErr;
  }

  const targetKey = (t: RenderTarget): string =>
    t.kind === 'blank'
      ? 'blank'
      : `${t.kind === 'pdf' ? t.filePath : t.imagePath}#${t.pageIndex}/${t.half ?? 'full'}`;
  const failLabel = (t: RenderTarget): string =>
    t.kind === 'blank' ? 'Page failed to load' : `Page ${t.pageIndex + 1} failed to load`;

  /** Resolve + paint one target into one canvas (or clear it for a blank slot). */
  function paintInto(cv: HTMLCanvasElement, target: RenderTarget, token: number): Promise<void> {
    return resolveWithRetry(target, cv.height).then((resolved) => {
      if (token !== renderSeq) return;
      if (resolved) paintSource(cv, resolved, zoomPreset);
      else clearCanvas(cv);
    });
  }

  // After local retries fail, one `ready()` re-sync heals a transient desync.
  // If the SAME primary target fails again, give up and surface it — re-requesting
  // forever would loop ready → render → fail without end.
  let lastFailedTarget: string | null = null;

  reader.onRender((instruction) => {
    zoomPreset = instruction.zoomPreset;
    readingDirection = instruction.readingDirection;
    help.setDirection(readingDirection);
    currentTarget = instruction.current;
    overlay?.setProgress(instruction.pages, totalPages);
    overlay?.setActiveZoom(instruction.zoomPreset);
    prefetch(instruction.prefetch, canvas.height);
    const token = ++renderSeq;

    // Two-up: the spread's right page paints independently into the right canvas.
    if (twoUp) {
      const secondary = instruction.secondary ?? ({ kind: 'blank' } as RenderTarget);
      paintInto(rightCanvas, secondary, token).catch(() => {
        if (token !== renderSeq) return;
        clearCanvas(rightCanvas);
        toast(failLabel(secondary));
      });
    }

    // Primary page: retry, then one re-sync, then surface the failure.
    paintInto(canvas, instruction.current, token)
      .then(() => {
        if (token !== renderSeq) return;
        lastFailedTarget = null;
        loadingEl?.classList.add('hidden'); // first paint done
      })
      .catch((err) => {
        console.error('render failed:', err);
        if (token !== renderSeq) return;
        const key = targetKey(instruction.current);
        if (key !== lastFailedTarget) {
          lastFailedTarget = key;
          reader.ready(); // pull the authoritative spread again to re-align
          return;
        }
        clearCanvas(canvas);
        loadingEl?.classList.add('hidden');
        toast(failLabel(instruction.current));
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
      onBack: () => reader.openLibrary(),
    });
  });
  reader.onShowOverlay(() => overlay?.toggle());
  reader.onShowHelp(() => help.show());
  reader.onHideHelp(() => help.hide());
  reader.onStatus((message) => setStatus(message));
  reader.onProgress(({ current, total, message }) =>
    setProgress(current, total, message),
  );
  reader.onFullScreenChanged((_isFs) => { /* full-screen state tracked by main process; Esc key toggles */ });
  reader.onSetDim((level) => {
    dimLayer.style.opacity = level === null ? '0' : String((100 - level) / 100);
  });

  // Keyboard: Escape closes the topmost layer before touching full-screen
  // (page menu → help → overlay/dial pad → full-screen); F/F11 toggle
  // full-screen; Ctrl+Q quits.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const pageMenu = document.querySelector('.tile-ctx-backdrop');
      if (pageMenu) {
        pageMenu.remove();
        return;
      }
      if (help.isVisible()) {
        reader.dismissHelp();
        return;
      }
      if (overlay?.dismissTopmost()) return;
      reader.toggleFullScreen();
    } else if (e.key === 'F11' || (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      reader.toggleFullScreen();
    } else if (e.key.toLowerCase() === 'q' && (e.ctrlKey || e.metaKey)) {
      reader.quit();
    }
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
      sizeCanvases();
      reader.ready(); // re-request the current spread at the new size
    }, 150);
  });

  reader.ready();
}

void main();
