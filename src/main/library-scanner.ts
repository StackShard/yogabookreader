/**
 * Library folder scanning (PRD §File Management, US#18).
 *
 * Recursively scans a root folder for supported documents and reports them
 * grouped by sub-folder. Cover thumbnails are generated lazily by the renderer
 * (which already has the rendering pipeline); this module tracks the catalogue
 * and the on-disk thumbnail cache location.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { SUPPORTED_EXTENSIONS, detectType } from './file-loader.js';
import type { DocumentType } from '../shared/ipc.js';

export interface LibraryEntry {
  filePath: string;
  displayName: string;
  type: DocumentType;
  /** Directory of the file relative to the scanned root (''-> directly in root). */
  relativeDir: string;
}

/** Directory where generated cover thumbnails are cached. */
export function thumbnailCacheDir(): string {
  return path.join(app.getPath('userData'), 'thumbnails');
}

function toEntry(filePath: string, root: string): LibraryEntry | null {
  const type = detectType(filePath);
  if (!type) return null;
  // Normalize separators so the relative folder reads the same on any platform.
  const relativeDir = path.relative(root, path.dirname(filePath)).split(path.sep).join('/');
  return {
    filePath,
    displayName: path.basename(filePath, path.extname(filePath)),
    type,
    relativeDir,
  };
}

/** Recursively collect supported documents under a root folder. */
export async function scanFolder(
  root: string,
  onProgress?: (current: number, total: number) => void,
): Promise<LibraryEntry[]> {
  const results: LibraryEntry[] = [];

  // Quick counting pass so we can report determinate progress during the real
  // walk. This is one extra readdir per directory but avoids showing an
  // indeterminate bar for a large library.
  let totalFiles = 0;
  async function count(dir: string): Promise<void> {
    let dirents;
    try { dirents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    const subcounts: Promise<void>[] = [];
    for (const d of dirents) {
      if (d.isDirectory()) { subcounts.push(count(path.join(dir, d.name))); }
      else if (SUPPORTED_EXTENSIONS.includes(path.extname(d.name).toLowerCase())) { totalFiles++; }
    }
    await Promise.all(subcounts);
  }

  async function walk(dir: string): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }
    // Walk sub-folders concurrently instead of one at a time; final results
    // are sorted below, so push order doesn't matter.
    const subwalks: Promise<void>[] = [];
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        subwalks.push(walk(full));
      } else if (SUPPORTED_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase())) {
        const entry = toEntry(full, root);
        if (entry) {
          results.push(entry);
          if (onProgress) onProgress(results.length, totalFiles);
        }
      }
    }
    await Promise.all(subwalks);
  }

  if (onProgress) {
    await count(root);
    onProgress(0, totalFiles);
  }
  await walk(root);
  results.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
  return results;
}
