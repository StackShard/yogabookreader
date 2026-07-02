/**
 * Renderer painting engine (PRD §Rendering, US#13/#14, §pre-render buffer).
 *
 * Resolves a {@link RenderTarget} to a drawable source (PDF page via pdf.js, or a
 * comic image) and paints it onto a canvas with the chosen zoom preset and the
 * half-crop used for centerfold / spread-encoded pages.
 *
 * Resolve and paint are split so the caller can discard a stale async resolve
 * (rapid page turns) before painting. Decoded images are kept in a small LRU so
 * neighbouring spreads stay warm without unbounded memory growth.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RenderTarget } from '../shared/ipc.js';
import type { Side, ZoomPreset } from '../core/types.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type Source = CanvasImageSource & { width: number; height: number };

/** Max decoded comic images kept in memory at once (current ± neighbours). */
const IMAGE_CACHE_CAP = 16;
/** Max pre-rasterized PDF page canvases kept (current ± neighbours per window). */
const PDF_PAGE_CACHE_CAP = 8;

const pdfDocs = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const pdfPageCache = new Map<string, Promise<Source>>();

/** A drawable source plus the half-crop to apply when painting it. */
export interface ResolvedSource {
  source: Source;
  half?: Side;
}

/** LRU: refresh recency by re-inserting. */
function touch<K, V>(map: Map<K, V>, key: K): void {
  const v = map.get(key);
  if (v !== undefined) {
    map.delete(key);
    map.set(key, v);
  }
}

/** Evict oldest entries until within capacity. */
function evict<K, V>(map: Map<K, V>, cap: number): void {
  while (map.size > cap) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function getPdf(filePath: string): Promise<pdfjsLib.PDFDocumentProxy> {
  let doc = pdfDocs.get(filePath);
  if (!doc) {
    doc = pdfjsLib.getDocument({
      url: fileUrl(filePath),
      isEvalSupported: false,
    }).promise;
    pdfDocs.set(filePath, doc);
  }
  return doc;
}

function getImage(imagePath: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(imagePath);
  if (cached) {
    touch(imageCache, imagePath);
    return cached;
  }
  const img = new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
    el.src = fileUrl(imagePath);
  }).catch((err) => {
    // Evict the failed load so a transient decode/IPC hiccup can be retried
    // (mirrors the PDF page cache; a cached rejection would fail forever).
    imageCache.delete(imagePath);
    throw err;
  });
  imageCache.set(imagePath, img);
  evict(imageCache, IMAGE_CACHE_CAP);
  return img;
}

/** Release all cached PDFs/images/rendered pages. Call when switching documents. */
export function resetCaches(): void {
  for (const docPromise of pdfDocs.values()) {
    docPromise.then((d) => d.destroy()).catch(() => undefined);
  }
  pdfDocs.clear();
  imageCache.clear();
  pdfPageCache.clear();
}

function fileUrl(p: string): string {
  // Serve local files through the privileged app protocol (the renderer is not
  // allowed to load file:// resources). See src/main/protocol.ts.
  return `yreader://f/${encodeURIComponent(p)}`;
}

/** Region of the source to draw, accounting for a left/right half crop. */
function sourceRegion(source: Source, half?: Side): { sx: number; sy: number; sw: number; sh: number } {
  if (!half) return { sx: 0, sy: 0, sw: source.width, sh: source.height };
  const sw = source.width / 2;
  return { sx: half === 'left' ? 0 : sw, sy: 0, sw, sh: source.height };
}

/** Scale factor to map a source region into the canvas per zoom preset. */
function presetScale(preset: ZoomPreset, sw: number, sh: number, dw: number, dh: number): number {
  switch (preset) {
    case 'fit-width':
      return dw / sw;
    case 'full-bleed':
      return Math.max(dw / sw, dh / sh); // cover, may crop
    case 'fit-height':
    default:
      return dh / sh; // PRD US#14: default, complete page with letterboxing
  }
}

/** Clear a canvas to black (used for blank slots and before an error). */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Paint a resolved source onto the canvas with the given zoom preset. */
export function paintSource(
  canvas: HTMLCanvasElement,
  resolved: ResolvedSource,
  preset: ZoomPreset,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { source, half } = resolved;
  const { sx, sy, sw, sh } = sourceRegion(source, half);
  const scale = presetScale(preset, sw, sh, canvas.width, canvas.height);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function renderPdfToSource(filePath: string, pageIndex: number, targetHeight: number): Promise<Source> {
  const doc = await getPdf(filePath);
  const page = await doc.getPage(pageIndex + 1); // pdf.js is 1-based
  const base = page.getViewport({ scale: 1 });
  // Render so the page height roughly matches the canvas height for crisp output.
  const scale = Math.max(0.1, targetHeight / base.height);
  const viewport = page.getViewport({ scale });
  const off = document.createElement('canvas');
  off.width = Math.ceil(viewport.width);
  off.height = Math.ceil(viewport.height);
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('No 2D context for PDF render');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return off as unknown as Source;
}

/**
 * Cached PDF page rasterization keyed by file/page/height, so neighbouring pages
 * warmed by {@link prefetch} make the next turn instant. Bounded LRU; a failed
 * render is evicted so it can be retried.
 */
function getRenderedPdf(filePath: string, pageIndex: number, targetHeight: number): Promise<Source> {
  const key = `${filePath}#${pageIndex}@${targetHeight}`;
  const cached = pdfPageCache.get(key);
  if (cached) {
    touch(pdfPageCache, key);
    return cached;
  }
  const rendered = renderPdfToSource(filePath, pageIndex, targetHeight).catch((err) => {
    pdfPageCache.delete(key);
    throw err;
  });
  pdfPageCache.set(key, rendered);
  evict(pdfPageCache, PDF_PAGE_CACHE_CAP);
  return rendered;
}

/**
 * Render a full PDF page to a high-resolution PNG data URL, for saving/printing
 * a single page. Always the whole page (no half-crop), at a generous width so
 * the exported image is crisp regardless of the on-screen zoom.
 */
export async function renderPdfPagePng(filePath: string, pageIndex: number): Promise<string> {
  const TARGET_WIDTH = 1600;
  const doc = await getPdf(filePath);
  const page = await doc.getPage(pageIndex + 1); // pdf.js is 1-based
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.max(0.1, TARGET_WIDTH / base.width) });
  const off = document.createElement('canvas');
  off.width = Math.ceil(viewport.width);
  off.height = Math.ceil(viewport.height);
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('No 2D context for PDF page export');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return off.toDataURL('image/png');
}

/**
 * Resolve a render target to a drawable source. Returns null for blank slots.
 * Does not touch the visible canvas, so the caller can discard a stale result.
 */
export async function resolveTarget(
  target: RenderTarget,
  targetHeight: number,
): Promise<ResolvedSource | null> {
  if (target.kind === 'blank') return null;
  if (target.kind === 'pdf') {
    const source = await getRenderedPdf(target.filePath, target.pageIndex, targetHeight);
    return { source, half: target.half };
  }
  const img = await getImage(target.imagePath);
  return { source: img as unknown as Source, half: target.half };
}

/**
 * Warm the cache for upcoming targets so page turns are instant. PDF pages are
 * pre-rasterized at the given canvas height; comic images are pre-decoded.
 */
export function prefetch(targets: RenderTarget[], targetHeight: number): void {
  for (const t of targets) {
    if (t.kind === 'pdf') void getRenderedPdf(t.filePath, t.pageIndex, targetHeight).catch(() => undefined);
    else if (t.kind === 'image') void getImage(t.imagePath);
  }
}
