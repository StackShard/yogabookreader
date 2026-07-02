/**
 * Cover thumbnail generation for the library/splash gallery.
 *
 * Covers are rendered in the renderer (pdf.js for PDFs, the first image for
 * comics) and cached to disk via the main process. Generation is concurrency-
 * limited so a large folder doesn't stall, and any failure resolves to null so
 * the caller falls back to the letter placeholder.
 */

// Lazy-load pdf.js so the splash screen's module graph doesn't pay 2-5s of
// evaluation time at first paint. Vite/ESM caches dynamic imports globally, so
// there is no duplicate load — the first call warms the cache, the rest are free.
let _pdfjsInit: Promise<typeof import('pdfjs-dist')> | null = null;

function ensurePdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!_pdfjsInit) {
    _pdfjsInit = (async () => {
      const m = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      m.GlobalWorkerOptions.workerSrc = worker.default;
      return m;
    })();
  }
  return _pdfjsInit;
}

const COVER_WIDTH = 320;
const MAX_CONCURRENT = 3;

let active = 0;
const waiting: Array<() => void> = [];

// Progress tracking for the "Generating covers… X/Y" status (counts real
// generations, i.e. cache misses; cached covers resolve instantly and aren't
// counted).
let genTotal = 0;
let genDone = 0;
const progressListeners: Array<(done: number, total: number) => void> = [];

export function onCoverProgress(cb: (done: number, total: number) => void): void {
  progressListeners.push(cb);
}

function emitProgress(): void {
  for (const cb of progressListeners) cb(genDone, genTotal);
}

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
  const pdfjsLib = await ensurePdfjs();
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

// In-flight generations by file path: a file shown on two shelves (Recent AND
// Library), or a re-render racing a slow generation, must not run twice.
const inFlight = new Map<string, Promise<string | null>>();

// Batch cache-check results from the most recent primeCoverCache() call: a
// large library render used to fire one getCachedCover IPC call PER TILE
// (hundreds/thousands at once, all before the concurrency limit below even
// applies). Priming does one bulk IPC call up front; getCover then reads
// from this map instead of hitting IPC per file.
const cachedUrls = new Map<string, string>();
const primed = new Set<string>();
let primePromise: Promise<void> | null = null;

/**
 * Batch-check the cover cache for a whole set of files in one IPC round trip,
 * so a library render doesn't fire one cache-check call per tile. Call this
 * right before rendering a large gallery; getCover() will wait for it.
 */
export function primeCoverCache(filePaths: string[]): Promise<void> {
  const p = window.reader
    .getCachedCovers(filePaths)
    .then((hits) => {
      for (const [fp, url] of Object.entries(hits)) cachedUrls.set(fp, url);
      for (const fp of filePaths) primed.add(fp);
    })
    .catch(() => undefined);
  primePromise = p;
  return p;
}

/**
 * Return a cover image URL for a file: the cached thumbnail if present, otherwise
 * rendered + persisted on demand. Resolves null if a cover can't be produced.
 */
export function getCover(filePath: string): Promise<string | null> {
  const running = inFlight.get(filePath);
  if (running) return running;
  const job = generateCover(filePath).finally(() => inFlight.delete(filePath));
  inFlight.set(filePath, job);
  return job;
}

async function generateCover(filePath: string): Promise<string | null> {
  if (primePromise) await primePromise;
  const primedHit = cachedUrls.get(filePath);
  if (primedHit) return primedHit;
  if (!primed.has(filePath)) {
    // Not covered by the last batch prime (e.g. added afterward) — fall back
    // to the single-item check rather than skipping the cache entirely.
    const cached = await window.reader.getCachedCover(filePath).catch(() => null);
    if (cached) return cached;
  }

  genTotal++;
  emitProgress();
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
    genDone++;
    emitProgress();
  }
}
