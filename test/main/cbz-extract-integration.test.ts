/**
 * End-to-end CBZ extraction against a real (synthetic) archive. Exercises the
 * duplicate-basename case that used to silently lose pages: ch1/01.jpg and
 * ch2/01.jpg both flattened to 01.jpg and overwrote each other.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterAll, expect, it } from 'vitest';
import { extractComic, extractFirstImage } from '../../src/main/cbz-extractor.js';

let scratch: string | null = null;

async function makeCbz(): Promise<string> {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'ybr-test-'));
  const zip = new AdmZip();
  zip.addFile('ch1/01.jpg', Buffer.from('page-1'));
  zip.addFile('ch1/02.jpg', Buffer.from('page-2'));
  zip.addFile('ch2/01.jpg', Buffer.from('page-3'));
  zip.addFile('notes.txt', Buffer.from('not a page'));
  const file = path.join(scratch, 'book.cbz');
  await fs.writeFile(file, zip.toBuffer());
  return file;
}

afterAll(async () => {
  if (scratch) await fs.rm(scratch, { recursive: true, force: true });
});

it('extracts every page of an archive whose sub-folders share basenames, in reading order', async () => {
  const cbz = await makeCbz();
  const pages = await extractComic(cbz, 'cbz');
  expect(pages).toHaveLength(3);
  const contents = await Promise.all(pages.map((p) => fs.readFile(p, 'utf8')));
  expect(contents).toEqual(['page-1', 'page-2', 'page-3']);

  const cover = await extractFirstImage(cbz, 'cbz');
  expect(cover).not.toBeNull();
  expect(await fs.readFile(cover!, 'utf8')).toBe('page-1');
});
