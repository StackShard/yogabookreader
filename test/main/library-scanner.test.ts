/**
 * `scanFolder`'s recursive walk now fans out sibling sub-directories with
 * `Promise.all` instead of awaiting them one at a time. Since results are
 * sorted before returning, concurrency shouldn't change the output — this
 * just proves it still finds everything, correctly grouped, after that change.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

// library-scanner.ts imports `electron` (for thumbnailCacheDir's app.getPath),
// which isn't installed in this dev/CI-less sandbox; scanFolder() itself
// never calls it, so a minimal stub is enough for the module to load.
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

const { scanFolder } = await import('../../src/main/library-scanner.js');

let root: string | null = null;

async function makeTree(): Promise<string> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ybr-scan-test-'));
  await fs.mkdir(path.join(root, 'ch1'), { recursive: true });
  await fs.mkdir(path.join(root, 'ch2', 'nested'), { recursive: true });
  await fs.writeFile(path.join(root, 'cover.pdf'), 'x');
  await fs.writeFile(path.join(root, 'ch1', 'a.cbz'), 'x');
  await fs.writeFile(path.join(root, 'ch1', 'notes.txt'), 'x'); // not a supported doc
  await fs.writeFile(path.join(root, 'ch2', 'b.cbr'), 'x');
  await fs.writeFile(path.join(root, 'ch2', 'nested', 'c.pdf'), 'x');
  return root;
}

afterAll(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('finds every supported document across concurrently-walked sub-folders', async () => {
  const dir = await makeTree();
  const entries = await scanFolder(dir);
  expect(entries).toHaveLength(4);
  expect(new Set(entries.map((e) => e.relativeDir))).toEqual(
    new Set(['', 'ch1', 'ch2', 'ch2/nested']),
  );
  expect(entries.every((e) => e.filePath.startsWith(dir))).toBe(true);
});
