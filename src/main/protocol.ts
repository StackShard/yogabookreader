/**
 * Custom `yreader://` protocol for serving local document/image files to the
 * renderer.
 *
 * Electron forbids a renderer page (whether on the dev-server origin or a
 * packaged `file://` origin) from loading arbitrary `file://` resources, so
 * pdf.js and `<img>` cannot read the user's files directly. This privileged,
 * fetch-able scheme reads the bytes in the main process and hands them back,
 * which works identically in development and when packaged.
 *
 * URL shape: `yreader://f/<encodeURIComponent(absolutePath)>`.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { protocol } from 'electron';
import { log, logError } from './log.js';

export const SCHEME = 'yreader';

/** Must be called before `app.whenReady()` (Electron requirement). */
export function registerPrivilegedScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
    },
  ]);
}

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  // The print path serves a tiny full-page HTML wrapper through this scheme.
  '.html': 'text/html',
  '.htm': 'text/html',
};

/** Build a `yreader://` URL the renderer can fetch for an absolute file path. */
export function fileUrl(absPath: string): string {
  return `${SCHEME}://f/${encodeURIComponent(absPath)}`;
}

/** Register the protocol handler. Call once after `app.whenReady()`. */
export function registerFileProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const data = await fs.readFile(filePath);
      const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(data, {
        headers: { 'Content-Type': mime, 'Content-Length': String(data.byteLength) },
      });
    } catch (err) {
      logError('protocol read failed:', request.url, (err as Error).message);
      return new Response('Not found', { status: 404 });
    }
  });
  log('registered protocol', `${SCHEME}://`);
}
