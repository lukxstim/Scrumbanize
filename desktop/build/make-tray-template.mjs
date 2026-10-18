// Draws the macOS menu bar icon (US-20): the logo's three bars, solid black with the header line cut out, as a
// "template" image that macOS tints for light and dark menu bars. Writes trayTemplate.svg (for reference) and
// trayTemplate.png / trayTemplate@2x.png (16 and 32 px) next to this file. Run: node build/make-tray-template.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// In a 16 × 16 grid: left, top, right, bottom of each bar; the middle bar is the tallest, as in the logo.
const BARS = [
  [1, 4, 5, 14.5],
  [6, 1.5, 10, 14.5],
  [11, 4, 15, 14.5],
];
const RADIUS = 1.25;
/** The short line near the top of each bar, cut out. */
const LINE = { inset: 1, offset: 1.5, height: 1 };

function insideRoundedRect(x, y, [l, t, r, b], radius) {
  if (x < l || x > r || y < t || y > b) return false;
  const cx = Math.min(Math.max(x, l + radius), r - radius);
  const cy = Math.min(Math.max(y, t + radius), b - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function covered(x, y) {
  return BARS.some((bar) => {
    if (!insideRoundedRect(x, y, bar, RADIUS)) return false;
    const [l, t, r] = bar;
    const inLine = x >= l + LINE.inset && x <= r - LINE.inset && y >= t + LINE.offset && y <= t + LINE.offset + LINE.height;
    return !inLine;
  });
}

/** RGBA pixels at `size` px, antialiased by sampling each pixel 8 × 8 times. */
function render(size) {
  const scale = 16 / size;
  const samples = 8;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = [0]; // PNG filter type "none"
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          if (covered((px + (sx + 0.5) / samples) * scale, (py + (sy + 0.5) / samples) * scale)) hits++;
        }
      }
      row.push(0, 0, 0, Math.round((255 * hits) / samples ** 2));
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat(rows);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(render(size))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
  '  <mask id="lines"><rect width="16" height="16" fill="white"/>',
  ...BARS.map(([l, t, r]) => `    <rect x="${l + LINE.inset}" y="${t + LINE.offset}" width="${r - l - 2 * LINE.inset}" height="${LINE.height}" fill="black"/>`),
  '  </mask>',
  '  <g mask="url(#lines)">',
  ...BARS.map(([l, t, r, b]) => `    <rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" rx="${RADIUS}"/>`),
  '  </g>',
  '</svg>',
  '',
].join('\n');

fs.writeFileSync(path.join(dir, 'trayTemplate.svg'), svg);
fs.writeFileSync(path.join(dir, 'trayTemplate.png'), png(16));
fs.writeFileSync(path.join(dir, 'trayTemplate@2x.png'), png(32));
console.log('trayTemplate.svg, trayTemplate.png, trayTemplate@2x.png written');
