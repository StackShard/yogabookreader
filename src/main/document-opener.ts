/**
 * Document open pipeline (PRD §File Management, §Spread Logic, §Error Handling).
 *
 * Extracted from ReaderController to consolidate the file-analysis and
 * session-creation logic behind one seam. The call flow is:
 *
 *   1. {@link analyzeFile} — detect type, load pages (fast path), provisionally
 *      classify, build a {@link ReaderSession}. Returns synchronously-ish so the
 *      document appears instantly.
 *
 *   2. (controller) — navigates windows, records recent file, fires background
 *      classification.
 *
 *   3. {@link classifyInBackground} — run the expensive per-page classification
 *      and apply the result to the session (if it's still the current document).
 *
 * The controller owns the race-guard token; this module is stateless.
 */

import path from 'node:path';
import {
  DEFAULT_SETTINGS,
  type DisplayMode,
  type PerFileState,
} from '../core/types.js';
import { provisionalClassification } from '../core/aspect.js';
import type { AppSettings } from '../core/types.js';
import type { DocumentType } from '../shared/ipc.js';
import {
  detectType,
  loadComicImages,
  classifyComicImages,
  FileLoadError,
} from './file-loader.js';
import { loadPdfPageCount, classifyPdf } from './pdf-meta.js';
import { ReaderSession } from './session.js';
import { log, logError } from './log.js';

export interface OpenResult {
  session: ReaderSession;
  type: DocumentType;
  displayName: string;
  imagePaths?: string[];
}

/**
 * Analyze a file and create a ReaderSession with provisional classification.
 *
 * Fast path: reads page count (PDF) or extracts images (comics) first, then
 * immediately creates a session with all pages classified as `single` (or
 * `spread-encoded` if a saved override exists). The expensive per-page
 * dimension analysis runs separately via {@link classifyInBackground}.
 *
 * Throws {@link FileLoadError} for corrupt/encrypted/not-found files.
 */
export async function analyzeFile(
  filePath: string,
  settings: AppSettings,
  fileState: PerFileState | undefined,
  displayMode: DisplayMode,
): Promise<OpenResult> {
  const type = detectType(filePath);
  if (!type) {
    throw new FileLoadError({
      filePath,
      reason: 'unsupported',
      message: 'Unsupported file type.',
    });
  }

  const readingDirection =
    fileState?.readingDirection ?? settings.defaultReadingDirection;
  // Always open at the code default (Fit Width); ignore stale persisted zoom
  // so the default reliably wins. The overlay buttons still change it per session.
  const zoomPreset = DEFAULT_SETTINGS.defaultZoomPreset;
  const override = fileState?.isSpreadEncoded;
  const displayName = path.basename(filePath, path.extname(filePath));

  let totalPages: number;
  let imagePaths: string[] | undefined;

  if (type === 'pdf') {
    totalPages = await loadPdfPageCount(filePath);
  } else {
    imagePaths = await loadComicImages(filePath, type);
    totalPages = imagePaths.length;
  }

  const provisional = provisionalClassification(totalPages, override);
  const session = new ReaderSession({
    filePath,
    displayName,
    type,
    pdfPath: type === 'pdf' ? filePath : undefined,
    imagePaths,
    totalPages,
    pageAspects: provisional.pageAspects,
    isSpreadEncoded: provisional.isSpreadEncoded,
    readingDirection,
    zoomPreset,
    displayMode,
    startPage: fileState?.lastPage,
  });

  log('opened (provisional):', totalPages, 'pages, mode =', displayMode);
  return { session, type, displayName, imagePaths };
}

export interface RefineResult {
  isSpreadEncoded: boolean;
  pageAspects: import('../core/types.js').AspectClass[];
}

/**
 * Run the full per-page dimension analysis and return the refined
 * spread-encoding / page-aspect results. Caller is responsible for
 * applying the result to the session and re-rendering.
 *
 * Returns `null` when the file can't be classified (logged, not thrown).
 */
export async function refineClassification(
  filePath: string,
  type: DocumentType,
  imagePaths: string[] | undefined,
  override: boolean | undefined,
): Promise<RefineResult | null> {
  try {
    const result =
      type === 'pdf'
        ? await classifyPdf(filePath, override)
        : await classifyComicImages(imagePaths ?? [], override);
    return { isSpreadEncoded: result.isSpreadEncoded, pageAspects: result.pageAspects };
  } catch (err) {
    logError('background classify failed:', (err as Error).message);
    return null;
  }
}
