/**
 * Reader session — the live document state in the main process.
 *
 * Wraps the pure core (spread building + navigation) and resolves each abstract
 * {@link ScreenContent} into a concrete {@link RenderTarget} a window can paint.
 * The main process owns exactly one of these per open document and broadcasts
 * per-window {@link RenderInstruction}s to both renderers (PRD §Multi-Window
 * Architecture).
 */

import { buildSpreads, pagesInSpread } from '../core/spread.js';
import {
  anchorPageOfSpread,
  clampSpreadIndex,
  findSpreadIndexForPage,
  nextSpreadIndex,
  prevSpreadIndex,
} from '../core/navigation.js';
import type {
  AspectClass,
  DisplayMode,
  DocumentModel,
  ReadingDirection,
  ScreenContent,
  SpreadLayout,
  ZoomPreset,
} from '../core/types.js';
import type {
  DocumentInfo,
  DocumentType,
  RenderInstruction,
  RenderTarget,
  WindowRole,
} from '../shared/ipc.js';

export interface SessionInit {
  filePath: string;
  displayName: string;
  type: DocumentType;
  /** For PDFs: the file path renderers load. */
  pdfPath?: string;
  /** For comics: extracted image paths, indexed by page. */
  imagePaths?: string[];
  totalPages: number;
  pageAspects: AspectClass[];
  isSpreadEncoded: boolean;
  readingDirection: ReadingDirection;
  zoomPreset: ZoomPreset;
  displayMode: DisplayMode;
  /** Spread to start on (derived from a persisted lastPage). */
  startPage?: number;
  /** Persisted user phase nudges (page indices forced to start a spread alone). */
  spreadBreaks?: number[];
}

export class ReaderSession {
  private readonly init: SessionInit;
  private model: DocumentModel;
  private displayMode: DisplayMode;
  private spreads: SpreadLayout[];
  private index = 0;
  private zoomPreset: ZoomPreset;

  constructor(init: SessionInit) {
    this.init = init;
    this.displayMode = init.displayMode;
    this.zoomPreset = init.zoomPreset;
    this.model = {
      totalPages: init.totalPages,
      readingDirection: init.readingDirection,
      pageAspects: init.pageAspects,
      isSpreadEncoded: init.isSpreadEncoded,
      spreadBreaks: init.spreadBreaks,
    };
    this.spreads = buildSpreads(this.model, this.displayMode);
    if (init.startPage !== undefined) {
      this.index = findSpreadIndexForPage(this.spreads, init.startPage);
    }
  }

  get spreadCount(): number {
    return this.spreads.length;
  }

  get currentIndex(): number {
    return this.index;
  }

  /** Page to persist as lastPage for resume-on-reopen. */
  get anchorPage(): number {
    const spread = this.spreads[this.index];
    return spread ? anchorPageOfSpread(spread) : 0;
  }

  next(): void {
    this.index = nextSpreadIndex(this.index, this.spreads.length);
  }

  prev(): void {
    this.index = prevSpreadIndex(this.index, this.spreads.length);
  }

  jumpToPage(pageIndex: number): void {
    this.index = findSpreadIndexForPage(this.spreads, pageIndex);
  }

  /** Rebuild spreads (e.g. after a direction or display-mode change), keeping place. */
  private rebuild(): void {
    const anchor = this.anchorPage;
    this.spreads = buildSpreads(this.model, this.displayMode);
    this.index = findSpreadIndexForPage(this.spreads, anchor);
  }

  setReadingDirection(direction: ReadingDirection): void {
    this.model = { ...this.model, readingDirection: direction };
    this.rebuild();
  }

  setDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode;
    this.rebuild();
  }

  setSpreadEncoded(value: boolean, pageAspects: AspectClass[]): void {
    this.model = { ...this.model, isSpreadEncoded: value, pageAspects };
    this.rebuild();
  }

  /**
   * Phase-nudge from the current page: force the page you're on to start a
   * spread alone, re-aligning every pair after it. Non-destructive — your place
   * is preserved across the rebuild. Toggling the same page clears that nudge.
   */
  nudgeSpreadHere(): void {
    const page = this.anchorPage;
    const breaks = new Set(this.model.spreadBreaks);
    if (breaks.has(page)) breaks.delete(page);
    else breaks.add(page);
    this.model = {
      ...this.model,
      spreadBreaks: [...breaks].sort((a, b) => a - b),
    };
    this.rebuild();
  }

  /** Clear every phase nudge, restoring normal pairing. */
  resetSpreadBreaks(): void {
    if (!this.model.spreadBreaks?.length) return;
    this.model = { ...this.model, spreadBreaks: [] };
    this.rebuild();
  }

  /** Current phase nudges, for persistence. */
  get spreadBreaks(): number[] {
    return this.model.spreadBreaks ?? [];
  }

  setZoomPreset(preset: ZoomPreset): void {
    this.zoomPreset = preset;
  }

  get readingDirection(): ReadingDirection {
    return this.model.readingDirection;
  }

  /** Comic image paths (undefined for PDFs). Used to reclassify in-place. */
  get imagePaths(): string[] | undefined {
    return this.init.imagePaths;
  }

  /** Resolve an abstract screen slot to a concrete render target. */
  private resolve(content: ScreenContent | null): RenderTarget {
    if (!content) return { kind: 'blank' };
    if (this.init.type === 'pdf' && this.init.pdfPath) {
      return {
        kind: 'pdf',
        filePath: this.init.pdfPath,
        pageIndex: content.pageIndex,
        half: content.half,
      };
    }
    const imagePath = this.init.imagePaths?.[content.pageIndex];
    if (!imagePath) return { kind: 'blank' };
    return { kind: 'image', imagePath, pageIndex: content.pageIndex, half: content.half };
  }

  /** Pick the slot a given window role renders from a spread. */
  private slotForRole(spread: SpreadLayout, role: WindowRole): ScreenContent | null {
    switch (role) {
      case 'left':
        return spread.left;
      case 'right':
        return spread.right;
      case 'single':
        return spread.left ?? spread.right;
    }
  }

  /** Build the render instruction (current + prefetch) for one window. */
  instructionFor(role: WindowRole): RenderInstruction {
    const at = (i: number): RenderTarget => {
      const spread = this.spreads[i];
      return spread ? this.resolve(this.slotForRole(spread, role)) : { kind: 'blank' };
    };
    const prefetchIndices = [
      nextSpreadIndex(this.index, this.spreads.length),
      prevSpreadIndex(this.index, this.spreads.length),
    ].filter((i) => i !== this.index);

    const currentSpread = this.spreads[this.index];
    return {
      current: at(this.index),
      prefetch: prefetchIndices.map(at),
      zoomPreset: this.zoomPreset,
      spreadIndex: clampSpreadIndex(this.index, this.spreads.length),
      pages: currentSpread ? pagesInSpread(currentSpread) : [],
      readingDirection: this.model.readingDirection,
    };
  }

  /** Metadata sent to renderers on load. */
  describe(): DocumentInfo {
    return {
      filePath: this.init.filePath,
      displayName: this.init.displayName,
      type: this.init.type,
      totalPages: this.model.totalPages,
      spreadCount: this.spreads.length,
      readingDirection: this.model.readingDirection,
      zoomPreset: this.zoomPreset,
      isSpreadEncoded: this.model.isSpreadEncoded,
    };
  }
}
