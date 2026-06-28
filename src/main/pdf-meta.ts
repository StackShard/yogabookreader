/**
 * PDF metadata extraction for the main process (PRD §Spread Logic, §Error
 * Handling). Uses pdf.js's legacy build to read page count and per-page
 * dimensions so the pure aspect classifier can detect centerfolds and
 * spread-encoded scans. Rendering itself still happens in the renderer.
 */

import { promises as fs } from 'node:fs';
import { classifyDocument, type PageDimensions } from '../core/aspect.js';
import type { AspectClass } from '../core/types.js';
import { FileLoadError } from './file-loader.js';

// pdf.js v4 is ESM-only. The main-process bundle is CommonJS, so it must be
// pulled in via a dynamic import() (require() of an .mjs throws ERR_REQUIRE_ESM).
// The legacy build runs under Node without a DOM. Cache the module promise.
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
  const data = new Uint8Array(await fs.readFile(filePath));
  const { getDocument } = await loadPdfjs();
  try {
    return await getDocument({ data, isEvalSupported: false }).promise;
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
export async function classifyPdf(filePath: string, override?: boolean): Promise<PdfMeta> {
  const doc = await openPdf(filePath);
  const dims: PageDimensions[] = [];
  const totalPages = doc.numPages;
  try {
    for (let i = 1; i <= totalPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      dims.push({ width: viewport.width, height: viewport.height });
    }
  } finally {
    // Release the worker/document resources; the renderer parses its own copy.
    await doc.destroy();
  }

  const { isSpreadEncoded, pageAspects } = classifyDocument(dims, override);
  return { totalPages, pageAspects, isSpreadEncoded };
}
