/**
 * File loading & type detection (PRD §File Management, §Error Handling, US#24).
 *
 * Detects the document type, validates that the file is readable, and for comic
 * archives extracts the page images and measures them so the pure aspect
 * classifier can run. PDF page metadata is gathered by the renderer's pdf.js
 * (which must parse the file to render it anyway) and reported back, so the main
 * process stays free of a pdf.js dependency.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { classifyDocument, type PageDimensions } from '../core/aspect.js';
import type { AspectClass } from '../core/types.js';
import type { DocumentType, ReaderError } from '../shared/ipc.js';
import { extractComic } from './cbz-extractor.js';
import { imageSize } from './image-size.js';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.cbz', '.cbr'];

export function detectType(filePath: string): DocumentType | null {
  switch (path.extname(filePath).toLowerCase()) {
    case '.pdf':
      return 'pdf';
    case '.cbz':
      return 'cbz';
    case '.cbr':
      return 'cbr';
    default:
      return null;
  }
}

/** A comic loaded into a temp dir, with measured pages classified. */
export interface LoadedComic {
  type: 'cbz' | 'cbr';
  imagePaths: string[];
  totalPages: number;
  pageAspects: AspectClass[];
  isSpreadEncoded: boolean;
}

export class FileLoadError extends Error {
  constructor(public readonly error: ReaderError) {
    super(error.message);
    this.name = 'FileLoadError';
  }
}

async function assertReadable(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new FileLoadError({
      filePath,
      reason: 'not-found',
      message: `File not found or unreadable: ${filePath}`,
    });
  }
}

/**
 * Load a comic archive: extract its images, measure them, and classify the
 * document (centerfold / spread-encoded detection). `override` forces the
 * spread-encoding decision when the user has set it for this file.
 */
export async function loadComic(
  filePath: string,
  kind: 'cbz' | 'cbr',
  override?: boolean,
): Promise<LoadedComic> {
  await assertReadable(filePath);

  let imagePaths: string[];
  try {
    imagePaths = await extractComic(filePath, kind);
  } catch (err) {
    throw new FileLoadError({
      filePath,
      reason: 'corrupt',
      message: `Could not extract archive: ${(err as Error).message}`,
    });
  }

  if (imagePaths.length === 0) {
    throw new FileLoadError({
      filePath,
      reason: 'unsupported',
      message: 'Archive contains no readable images.',
    });
  }

  const dims: PageDimensions[] = [];
  for (const imagePath of imagePaths) {
    const size = await imageSize(imagePath);
    // Default to a portrait single page if a format is unrecognized.
    dims.push(size ?? { width: 1000, height: 1600 });
  }

  const { isSpreadEncoded, pageAspects } = classifyDocument(dims, override);
  return {
    type: kind,
    imagePaths,
    totalPages: imagePaths.length,
    pageAspects,
    isSpreadEncoded,
  };
}
