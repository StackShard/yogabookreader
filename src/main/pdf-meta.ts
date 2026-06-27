/**
 * PDF metadata extraction for the main process (PRD §Spread Logic, §Error
 * Handling). Uses pdf.js's legacy build to read page count and per-page
 * dimensions so the pure aspect classifier can detect centerfolds and
 * spread-encoded scans. Rendering itself still happens in the renderer.
 */

import { promises as fs } from 'node:fs';
// The legacy build runs under Node without a DOM.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { classifyDocument, type PageDimensions } from '../core/aspect.js';
import type { AspectClass } from '../core/types.js';
import { FileLoadError } from './file-loader.js';

export interface PdfMeta {
  totalPages: number;
  pageAspects: AspectClass[];
  isSpreadEncoded: boolean;
}

/** Read page count + dimensions and classify the document. */
export async function loadPdfMeta(filePath: string, override?: boolean): Promise<PdfMeta> {
  const data = new Uint8Array(await fs.readFile(filePath));
  let doc;
  try {
    doc = await getDocument({ data, isEvalSupported: false }).promise;
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

  const dims: PageDimensions[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    dims.push({ width: viewport.width, height: viewport.height });
  }

  const { isSpreadEncoded, pageAspects } = classifyDocument(dims, override);
  return { totalPages: doc.numPages, pageAspects, isSpreadEncoded };
}
