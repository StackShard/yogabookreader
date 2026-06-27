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

/** Stable short hash of a file path (used for temp dirs and thumbnail names). */
export function hashPath(filePath: string): string {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

function workDir(filePath: string): string {
  return path.join(TEMP_ROOT, hashPath(filePath));
}

/** Remove temp directories left behind by a previous run/crash. */
export async function cleanupStaleTemp(): Promise<void> {
  await fs.rm(TEMP_ROOT, { recursive: true, force: true });
}

/** Remove the temp root entirely (call on app quit). */
export async function cleanupAllTemp(): Promise<void> {
  await fs.rm(TEMP_ROOT, { recursive: true, force: true });
}

async function extractZip(filePath: string, dir: string): Promise<void> {
  const zip = new AdmZip(filePath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !isImageEntry(entry.entryName)) continue;
    const out = path.join(dir, path.basename(entry.entryName));
    await fs.writeFile(out, entry.getData());
  }
}

async function extractRar(filePath: string, dir: string): Promise<void> {
  const data = await fs.readFile(filePath);
  const extractor = await createExtractorFromData({
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  });
  const extracted = extractor.extract();
  for (const file of extracted.files) {
    if (!file.extraction || !isImageEntry(file.fileHeader.name)) continue;
    const out = path.join(dir, path.basename(file.fileHeader.name));
    await fs.writeFile(out, file.extraction);
  }
}

/**
 * Extract a comic archive and return its page image paths in reading order.
 * `kind` selects the archive format (CBZ → zip, CBR → rar).
 */
export async function extractComic(
  filePath: string,
  kind: 'cbz' | 'cbr',
): Promise<string[]> {
  const dir = workDir(filePath);
  await fs.mkdir(dir, { recursive: true });

  if (kind === 'cbz') {
    await extractZip(filePath, dir);
  } else {
    await extractRar(filePath, dir);
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
    const first = zip
      .getEntries()
      .filter((e) => !e.isDirectory && isImageEntry(e.entryName))
      .sort((a, b) => naturalCompare(a.entryName, b.entryName))[0];
    if (!first) return null;
    const out = path.join(dir, path.basename(first.entryName));
    await fs.writeFile(out, first.getData());
    return out;
  }

  // CBR: extract all (node-unrar-js has no single-entry API), keep the first image.
  const data = await fs.readFile(filePath);
  const extractor = await createExtractorFromData({
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  });
  const files = [...extractor.extract().files]
    .filter((f) => f.extraction && isImageEntry(f.fileHeader.name))
    .sort((a, b) => naturalCompare(a.fileHeader.name, b.fileHeader.name));
  const first = files[0];
  if (!first || !first.extraction) return null;
  const out = path.join(dir, path.basename(first.fileHeader.name));
  await fs.writeFile(out, first.extraction);
  return out;
}
