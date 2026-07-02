/**
 * CBZ/CBR extraction (PRD §Rendering "CBZ/CBR", Further Notes §crash recovery).
 *
 * Comic archives are extracted on demand to a per-file temp directory under
 * `%TEMP%/yogabookreader/<filehash>/`. Image entries are returned in natural
 * sorted order so page N maps to the Nth image. The temp root is cleaned on app
 * exit and any stale directories from a previous crash are removed at startup.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

const TEMP_ROOT = path.join(os.tmpdir(), 'yogabookreader');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

function isImageEntry(name: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Natural sort so "page2" precedes "page10". */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Image entries of an archive in reading order (natural sort by full path). */
export function orderImageEntries(entryNames: string[]): string[] {
  return entryNames.filter(isImageEntry).sort(naturalCompare);
}

/**
 * On-disk name for an extracted page. The index prefix guarantees uniqueness —
 * entries in different sub-folders can share a basename (ch1/01.jpg, ch2/01.jpg),
 * which used to overwrite pages — and makes the extracted dir's natural-sort
 * order exactly the archive's reading order.
 */
export function pageFileName(index: number, entryName: string): string {
  const base = entryName.split(/[\\/]/).pop() ?? entryName;
  return `${String(index).padStart(5, '0')}_${base}`;
}

/** Stable short hash of a file path (used for temp dirs and thumbnail names). */
export function hashPath(filePath: string): string {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

function workDir(filePath: string): string {
  return path.join(TEMP_ROOT, hashPath(filePath));
}

/**
 * Remove temp directories left behind by a previous run/crash. Snapshots the
 * top-level entries once, then deletes exactly those — not a single whole-tree
 * `fs.rm` — so a concurrent `extractComic`/`extractFirstImage` call (which
 * always creates a *new* `workDir`, never one present in this snapshot) can
 * never race it. This lets the caller fire it without awaiting.
 */
export async function cleanupStaleTemp(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(TEMP_ROOT);
  } catch {
    return; // nothing to clean
  }
  await Promise.all(
    entries.map((name) =>
      fs.rm(path.join(TEMP_ROOT, name), { recursive: true, force: true }).catch(() => undefined),
    ),
  );
}

/** Remove the temp root entirely (call on app quit). */
export async function cleanupAllTemp(): Promise<void> {
  await fs.rm(TEMP_ROOT, { recursive: true, force: true });
}

async function extractZip(
  filePath: string,
  dir: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const zip = new AdmZip(filePath);
  const entries = new Map(
    zip.getEntries().filter((e) => !e.isDirectory).map((e) => [e.entryName, e]),
  );
  const ordered = orderImageEntries([...entries.keys()]);
  const total = ordered.length;
  if (onProgress) onProgress(0, total);
  for (const [i, name] of ordered.entries()) {
    await fs.writeFile(path.join(dir, pageFileName(i, name)), entries.get(name)!.getData());
    if (onProgress) onProgress(i + 1, total);
  }
}

async function extractRar(
  filePath: string,
  dir: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const data = await fs.readFile(filePath);
  const extractor = await createExtractorFromData({
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  });
  const files = new Map<string, Uint8Array>();
  for (const file of extractor.extract().files) {
    if (file.extraction) files.set(file.fileHeader.name, file.extraction);
  }
  const ordered = orderImageEntries([...files.keys()]);
  const total = ordered.length;
  if (onProgress) onProgress(0, total);
  for (const [i, name] of ordered.entries()) {
    await fs.writeFile(path.join(dir, pageFileName(i, name)), files.get(name)!);
    if (onProgress) onProgress(i + 1, total);
  }
}

/**
 * Extract a comic archive and return its page image paths in reading order.
 * `kind` selects the archive format (CBZ → zip, CBR → rar).
 */
export async function extractComic(
  filePath: string,
  kind: 'cbz' | 'cbr',
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const dir = workDir(filePath);
  await fs.mkdir(dir, { recursive: true });

  if (kind === 'cbz') {
    await extractZip(filePath, dir, onProgress);
  } else {
    await extractRar(filePath, dir, onProgress);
  }

  const entries = await fs.readdir(dir);
  return entries
    .filter(isImageEntry)
    .sort(naturalCompare)
    .map((name) => path.join(dir, name));
}

/**
 * Extract just the first image (the cover) of a comic archive and return its
 * path. Cheaper than extracting the whole archive for a thumbnail.
 */
export async function extractFirstImage(
  filePath: string,
  kind: 'cbz' | 'cbr',
): Promise<string | null> {
  const dir = path.join(workDir(filePath), 'cover');
  await fs.mkdir(dir, { recursive: true });

  if (kind === 'cbz') {
    const zip = new AdmZip(filePath);
    const entries = new Map(
      zip.getEntries().filter((e) => !e.isDirectory).map((e) => [e.entryName, e]),
    );
    const firstName = orderImageEntries([...entries.keys()])[0];
    if (!firstName) return null;
    const out = path.join(dir, pageFileName(0, firstName));
    await fs.writeFile(out, entries.get(firstName)!.getData());
    return out;
  }

  // CBR: list entries, then extract only the first image (not the whole archive).
  const data = await fs.readFile(filePath);
  const extractor = await createExtractorFromData({
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  });
  const names = [...extractor.getFileList().fileHeaders]
    .filter((h) => !h.flags.directory)
    .map((h) => h.name);
  const firstName = orderImageEntries(names)[0];
  if (!firstName) return null;
  const file = [...extractor.extract({ files: [firstName] }).files][0];
  if (!file || !file.extraction) return null;
  const out = path.join(dir, pageFileName(0, firstName));
  await fs.writeFile(out, file.extraction);
  return out;
}
