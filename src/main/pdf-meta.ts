/**
 * PDF metadata extraction for the main process (PRD §Spread Logic, §Error
 * Handling). Uses pdf.js's legacy build to read page count and per-page
 * dimensions so the pure aspect classifier can detect centerfolds and
 * spread-encoded scans. Rendering itself still happens in the renderer.
 */

import { classifyDocument, type PageDimensions } from '../core/aspect.js';
import type { AspectClass } from '../core/types.js';
import { FileLoadError } from './file-loader.js';

// pdf.js v4 is ESM-only. The main-process bundle is CommonJS, so it must be
// pulled in via a dynamic import() (require() of an .mjs throws ERR_REQUIRE_ESM).
// The legacy build runs under Node without a DOM. Cache the module promise.
//
// Note: this means the pdf.js worker blob is fetched twice — once by the main
// process (for metadata) and once by the renderer (for painting). The cost is
// paid once at startup and is acceptable given the single-purpose nature of the
// app; sharing a single pdf.js instance between the main and renderer processes
// is not possible in Electron's multi-process architecture.
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export interface PdfMeta {
  totalPages: number;
  pageAspects: AspectClass[];
  isSpreadEncoded: boolean;
}

async function openPdf(filePath: string): Promise<import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentProxy> {
  const { getDocument } = await loadPdfjs();
  // Use a file:// URL so pdf.js reads the file directly from disk instead of
  // loading the entire file into a Uint8Array first (cf. protocol range-request
  // support, which applies to the renderer path). For the main-process metadata
  // path this avoids a 200+ MB heap allocation per open.
  try {
    return await getDocument({ url: `file://${filePath}`, isEvalSupported: false }).promise;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'PasswordException') {
      throw new FileLoadError({
        filePath,
        reason: 'encrypted',
        message: 'This PDF is password-protected.',
      });
    }
    throw new FileLoadError({
      filePath,
      reason: 'corrupt',
      message: `Could not open PDF: ${(err as Error).message}`,
    });
  }
}

/**
 * Fast: open the PDF only to read its page count, then close it. Used to open the
 * document immediately; full per-page classification happens in the background.
 */
export async function loadPdfPageCount(filePath: string): Promise<number> {
  const doc = await openPdf(filePath);
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

/**
 * Slow: read every page's dimensions and classify the document
 * (centerfold / spread-encoded detection). Run off the open path.
 */
export async function classifyPdf(
  filePath: string,
  override?: boolean,
  onProgress?: (current: number, total: number) => void,
): Promise<PdfMeta> {
  const doc = await openPdf(filePath);
  const dims: PageDimensions[] = [];
  const totalPages = doc.numPages;
  if (onProgress) onProgress(0, totalPages);
  try {
    for (let i = 1; i <= totalPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      dims.push({ width: viewport.width, height: viewport.height });
      if (onProgress) onProgress(i, totalPages);
    }
  } finally {
    // Release the worker/document resources; the renderer parses its own copy.
    await doc.destroy();
  }

  const { isSpreadEncoded, pageAspects } = classifyDocument(dims, override);
  return { totalPages, pageAspects, isSpreadEncoded };
}
