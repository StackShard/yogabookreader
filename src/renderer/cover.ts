/**
 * Cover thumbnail generation for the library/splash gallery.
 *
 * Covers are rendered in the renderer (pdf.js for PDFs, the first image for
 * comics) and cached to disk via the main process. Generation is concurrency-
 * limited so a large folder doesn't stall, and any failure resolves to null so
 * the caller falls back to the letter placeholder.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const COVER_WIDTH = 320;
const MAX_CONCURRENT = 3;

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(): void {
  active--;
  const next = waiting.shift();
  if (next) {
    active++;
    next();
  }
}

async function renderPdfCover(url: string): Promise<string | null> {
  const doc = await pdfjsLib.getDocument({
    url,
    isEvalSupported: false,
    disableRange: true,
    disableStream: true,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    await doc.destroy();
  }
}

async function renderImageCover(url: string): Promise<string | null> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = url;
  });
  if (!img || !img.width) return null;
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = Math.ceil((img.height / img.width) * COVER_WIDTH);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Return a cover image URL for a file: the cached thumbnail if present, otherwise
 * rendered + persisted on demand. Resolves null if a cover can't be produced.
 */
export async function getCover(filePath: string): Promise<string | null> {
  const cached = await window.reader.getCachedCover(filePath).catch(() => null);
  if (cached) return cached;

  await acquire();
  try {
    const source = await window.reader.getCoverSource(filePath).catch(() => null);
    if (!source) return null;
    const dataUrl =
      source.kind === 'pdf'
        ? await renderPdfCover(source.url)
        : await renderImageCover(source.url);
    if (!dataUrl) return null;
    const saved = await window.reader.saveCover(filePath, dataUrl).catch(() => null);
    return saved ?? dataUrl;
  } catch {
    return null;
  } finally {
    release();
  }
}
