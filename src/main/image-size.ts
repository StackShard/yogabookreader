/**
 * Minimal image dimension reader for the formats found in comic archives.
 *
 * Reads just enough of the file header to recover width/height for PNG, JPEG,
 * GIF, BMP and WebP — enough to feed the pure aspect-ratio classifier
 * (`src/core/aspect.ts`) so centerfold/spread-encoded detection works for CBZ/CBR
 * without pulling in a native image dependency.
 */

import { promises as fs } from 'node:fs';

export interface Dimensions {
  width: number;
  height: number;
}

function readPng(buf: Buffer): Dimensions | null {
  // PNG signature, then IHDR with width/height as big-endian uint32 at 16/20.
  if (buf.length < 24) return null;
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readGif(buf: Buffer): Dimensions | null {
  if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function readBmp(buf: Buffer): Dimensions | null {
  if (buf.length < 26 || buf.toString('ascii', 0, 2) !== 'BM') return null;
  return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
}

function readWebp(buf: Buffer): Dimensions | null {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const format = buf.toString('ascii', 12, 16);
  if (format === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (format === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X') {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  return null;
}

function readJpeg(buf: Buffer): Dimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF15 (excluding 0xC4/0xC8/0xCC) carry frame dimensions.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}

/** Parse dimensions from a header buffer; null if unrecognized. */
export function parseImageSize(buf: Buffer): Dimensions | null {
  return (
    readPng(buf) ?? readGif(buf) ?? readBmp(buf) ?? readWebp(buf) ?? readJpeg(buf) ?? null
  );
}

/** Read just the header of an image file and return its dimensions. */
export async function imageSize(filePath: string): Promise<Dimensions | null> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return parseImageSize(buf.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
