/**
 * Cover-cache matching (pure). Answers "which of these files already have a
 * cached cover?" for a whole batch in one pass, instead of one filesystem
 * round trip per file — the difference between one `fs.readdir` and N
 * `fs.access` calls (and, from the renderer, one IPC call instead of N) when
 * a library has hundreds or thousands of items.
 */

/**
 * Filter `filePaths` down to the ones whose thumbnail file name is present in
 * `cachedFileNames`, mapping each hit to that file name. Paths not in the
 * result are misses (not cached, or unknown).
 */
export function matchCachedCovers(
  filePaths: string[],
  cachedFileNames: ReadonlySet<string>,
  thumbnailFileName: (filePath: string) => string,
): Map<string, string> {
  const hits = new Map<string, string>();
  for (const filePath of filePaths) {
    const name = thumbnailFileName(filePath);
    if (cachedFileNames.has(name)) hits.set(filePath, name);
  }
  return hits;
}
