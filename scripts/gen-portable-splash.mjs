/**
 * Generates build/portable-splash.bmp — the image electron-builder's portable
 * target shows WHILE the .exe self-extracts (before the app itself runs). This
 * is the only launch indication possible during that pre-app gap. Must be a
 * 24-bit uncompressed BMP. No external image deps, so a tiny 5x7 bitmap font is
 * embedded here. Re-run with `node scripts/gen-portable-splash.mjs`.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 5-wide x 7-tall glyphs, only the characters used below.
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
};

const W = 360;
const H = 170;
const BG = [18, 18, 20];
const FG = [244, 244, 245];
const ACCENT = [76, 154, 255];

// RGB buffer, row-major top-down.
const px = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = BG[0];
  px[i * 3 + 1] = BG[1];
  px[i * 3 + 2] = BG[2];
}

function setPixel(x, y, c) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function textWidth(text, scale) {
  return text.length * 6 * scale - scale; // 5px glyph + 1px gap, minus trailing gap
}

function drawText(text, cx, top, scale, color) {
  let x = Math.round(cx - textWidth(text, scale) / 2);
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[r][col] === '1') {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              setPixel(x + col * scale + dx, top + r * scale + dy, color);
            }
          }
        }
      }
    }
    x += 6 * scale;
  }
}

function fillRect(x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPixel(x, y, c);
}

// Wordmark, accent rule, then the "LOADING..." indication.
drawText('YOGA BOOK READER', W / 2, 42, 3, FG);
fillRect(Math.round(W / 2 - 130), 78, 260, 2, ACCENT);
drawText('LOADING...', W / 2, 100, 4, ACCENT);

// --- Encode as a 24-bit uncompressed BMP (bottom-up, BGR, 4-byte row pad) ---
const rowSize = Math.ceil((W * 3) / 4) * 4;
const pixelBytes = rowSize * H;
const fileSize = 54 + pixelBytes;
const buf = Buffer.alloc(fileSize);
buf.write('BM', 0, 'ascii');
buf.writeUInt32LE(fileSize, 2);
buf.writeUInt32LE(54, 10); // pixel data offset
buf.writeUInt32LE(40, 14); // DIB header size
buf.writeInt32LE(W, 18);
buf.writeInt32LE(H, 22); // positive = bottom-up
buf.writeUInt16LE(1, 26); // planes
buf.writeUInt16LE(24, 28); // bpp
buf.writeUInt32LE(0, 30); // BI_RGB, no compression
buf.writeUInt32LE(pixelBytes, 34);
buf.writeInt32LE(2835, 38); // ~72 DPI
buf.writeInt32LE(2835, 42);

let off = 54;
for (let y = H - 1; y >= 0; y--) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    buf[off++] = px[i + 2]; // B
    buf[off++] = px[i + 1]; // G
    buf[off++] = px[i]; // R
  }
  off += rowSize - W * 3; // row padding (already zeroed)
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'portable-splash.bmp');
writeFileSync(out, buf);
console.log(`wrote ${out} (${W}x${H}, ${fileSize} bytes)`);
