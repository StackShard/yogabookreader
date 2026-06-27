/**
 * Library folder scanning & watching (PRD §File Management, US#18).
 *
 * Recursively scans a root folder for supported documents and watches it for
 * changes via chokidar. Cover thumbnails are generated lazily by the renderer
 * (which already has the rendering pipeline); this module tracks the catalogue
 * and the on-disk thumbnail cache location.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { app } from 'electron';
import { SUPPORTED_EXTENSIONS, detectType } from './file-loader.js';
import type { DocumentType } from '../shared/ipc.js';

export interface LibraryEntry {
  filePath: string;
  displayName: string;
  type: DocumentType;
}

/** Directory where generated cover thumbnails are cached. */
export function thumbnailCacheDir(): string {
  return path.join(app.getPath('userData'), 'thumbnails');
}

function toEntry(filePath: string): LibraryEntry | null {
  const type = detectType(filePath);
  if (!type) return null;
  return { filePath, displayName: path.basename(filePath, path.extname(filePath)), type };
}

/** Recursively collect supported documents under a root folder. */
export async function scanFolder(root: string): Promise<LibraryEntry[]> {
  const results: LibraryEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(full);
      } else if (SUPPORTED_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase())) {
        const entry = toEntry(full);
        if (entry) results.push(entry);
      }
    }
  }

  await walk(root);
  results.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
  return results;
}

/**
 * Watch a root folder, invoking `onChange` (debounced by chokidar) whenever the
 * set of supported files changes. Returns the watcher so it can be closed.
 */
export function watchFolder(root: string, onChange: () => void): FSWatcher {
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    depth: 99,
    awaitWriteFinish: { stabilityThreshold: 500 },
  });
  const handle = (file: string): void => {
    if (SUPPORTED_EXTENSIONS.includes(path.extname(file).toLowerCase())) onChange();
  };
  watcher.on('add', handle).on('unlink', handle);
  return watcher;
}
