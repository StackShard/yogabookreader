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

/** Result of classifying a comic's already-extracted images. */
export interface ComicClassification {
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
 * Extract a comic archive to its temp dir and return the page image paths.
 * (Required before anything can render; the measure/classify step is separate so
 * the document can open before it runs.)
 */
export async function loadComicImages(
  filePath: string,
  kind: 'cbz' | 'cbr',
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  await assertReadable(filePath);

  let imagePaths: string[];
  try {
    imagePaths = await extractComic(filePath, kind, onProgress);
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
  return imagePaths;
}

/**
 * Measure the extracted images and classify the document (centerfold /
 * spread-encoded). Run off the open path; `override` forces the decision.
 */
export async function classifyComicImages(
  imagePaths: string[],
  override?: boolean,
  onProgress?: (current: number, total: number) => void,
): Promise<ComicClassification> {
  const dims: PageDimensions[] = [];
  const total = imagePaths.length;
  if (onProgress) onProgress(0, total);
  for (let i = 0; i < imagePaths.length; i++) {
    const size = await imageSize(imagePaths[i]);
    // Default to a portrait single page if a format is unrecognized.
    dims.push(size ?? { width: 1000, height: 1600 });
    if (onProgress) onProgress(i + 1, total);
  }
  return classifyDocument(dims, override);
}
