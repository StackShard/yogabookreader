/**
 * `cleanupStaleTemp` used to be a single whole-tree `fs.rm`, which the launch
 * path awaited before any window could appear — the dominant cause of a
 * 20+ second silent freeze when the temp dir had accumulated files across
 * crashed sessions. It's now snapshot-based (list once, delete exactly those
 * entries) specifically so the caller can fire it without awaiting: a
 * concurrent extraction always creates a brand-new dir, which can never be in
 * that snapshot. These tests operate on the real `os.tmpdir()/yogabookreader`
 * path (the module has no injection seam), isolated by unique sub-dir names.
 */

import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupStaleTemp } from '../../src/main/cbz-extractor.js';

const TEMP_ROOT = path.join(os.tmpdir(), 'yogabookreader');

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(TEMP_ROOT, { recursive: true, force: true });
});

describe('cleanupStaleTemp', () => {
  it('removes everything present under the temp root', async () => {
    await fsp.mkdir(path.join(TEMP_ROOT, 'stale-a'), { recursive: true });
    await fsp.writeFile(path.join(TEMP_ROOT, 'stale-a', 'page.jpg'), 'x');

    await cleanupStaleTemp();

    // The root itself is left in place (now empty) — only its entries are
    // deleted, unlike the old whole-tree `fs.rm(TEMP_ROOT)`.
    await expect(fsp.readdir(TEMP_ROOT)).resolves.toEqual([]);
  });

  it('is a no-op when the temp root does not exist yet', async () => {
    await fsp.rm(TEMP_ROOT, { recursive: true, force: true });
    await expect(cleanupStaleTemp()).resolves.toBeUndefined();
  });

  it('does not delete a directory created after the snapshot (no race with a concurrent extraction)', async () => {
    await fsp.mkdir(path.join(TEMP_ROOT, 'stale-b'), { recursive: true });

    // Hold the internal `fs.readdir` snapshot open so the test can create a
    // "fresh" directory (simulating a concurrent extractComic() call) at the
    // exact moment between the snapshot and the deletion phase.
    let releaseSnapshot: () => void = () => undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    let notifySnapshotStarted: () => void = () => undefined;
    const snapshotStarted = new Promise<void>((resolve) => {
      notifySnapshotStarted = resolve;
    });
    const realReaddir = fsp.readdir.bind(fsp);
    vi.spyOn(fsp, 'readdir').mockImplementation((async (dir: string) => {
      // Capture the snapshot immediately (matching real readdir timing), but
      // don't deliver it to the caller until the gate opens — this delays
      // only the *delivery*, not what the snapshot actually contains.
      const snapshot = await realReaddir(dir);
      notifySnapshotStarted();
      await snapshotGate;
      return snapshot;
    }) as typeof fsp.readdir);

    const cleanupPromise = cleanupStaleTemp();
    await snapshotStarted;

    const freshDir = path.join(TEMP_ROOT, 'fresh-c');
    await fsp.mkdir(freshDir, { recursive: true });
    await fsp.writeFile(path.join(freshDir, 'page.jpg'), 'y');

    releaseSnapshot();
    await cleanupPromise;

    await expect(fsp.access(path.join(TEMP_ROOT, 'stale-b'))).rejects.toThrow();
    await expect(fsp.access(path.join(freshDir, 'page.jpg'))).resolves.toBeUndefined();
  });
});
