/**
 * Renderer painting engine (PRD §Rendering, US#13/#14, §pre-render buffer).
 *
 * Paints a {@link RenderTarget} onto a canvas: PDF pages via pdf.js, comic pages
 * via images. Supports the three zoom presets and the half-crop used for
 * centerfold / spread-encoded pages. PDF documents and decoded images are cached
 * so neighbouring spreads can be pre-rendered for instant page turns.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RenderTarget } from '../shared/ipc.js';
import type { Side, ZoomPreset } from '../core/types.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type Source = CanvasImageSource & { width: number; height: number };

const pdfDocs = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function getPdf(filePath: string): Promise<pdfjsLib.PDFDocumentProxy> {
  let doc = pdfDocs.get(filePath);
  if (!doc) {
    doc = pdfjsLib.getDocument({ url: fileUrl(filePath), isEvalSupported: false }).promise;
    pdfDocs.set(filePath, doc);
  }
  return doc;
}

function getImage(imagePath: string): Promise<HTMLImageElement> {
  let img = imageCache.get(imagePath);
  if (!img) {
    img = new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
      el.src = fileUrl(imagePath);
    });
    imageCache.set(imagePath, img);
  }
  return img;
}

function fileUrl(p: string): string {
  // Normalize Windows backslashes and ensure an absolute file:// URL with the
  // correct number of slashes (Windows "C:\x" -> "file:///C:/x").
  const norm = p.replace(/\\/g, '/');
  const withSlash = norm.startsWith('/') ? norm : '/' + norm;
  return 'file://' + encodeURI(withSlash);
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

function paint(canvas: HTMLCanvasElement, source: Source, half: Side | undefined, preset: ZoomPreset): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
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

/** Paint a render target onto the given canvas. Blank targets clear to black. */
export async function renderTarget(
  canvas: HTMLCanvasElement,
  target: RenderTarget,
  preset: ZoomPreset,
): Promise<void> {
  if (target.kind === 'blank') {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }
  if (target.kind === 'pdf') {
    const source = await renderPdfToSource(target.filePath, target.pageIndex, canvas.height);
    paint(canvas, source, target.half, preset);
    return;
  }
  const img = await getImage(target.imagePath);
  paint(canvas, img as unknown as Source, target.half, preset);
}

/** Warm the cache for upcoming targets so page turns are instant (pre-render). */
export function prefetch(targets: RenderTarget[]): void {
  for (const t of targets) {
    if (t.kind === 'pdf') void getPdf(t.filePath);
    else if (t.kind === 'image') void getImage(t.imagePath);
  }
}
