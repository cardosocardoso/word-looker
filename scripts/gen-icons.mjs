import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeIcon(size) {
  const w = size, h = size;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const cx = size / 2 - size * 0.08;
  const cy = size / 2 - size * 0.08;
  const lensOuter = size * 0.32;
  const lensInner = size * 0.22;
  const handleStart = size * 0.35;
  const handleEnd = size * 0.48;
  const handleWidth = Math.max(1, size * 0.07);

  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(0);
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let r = 0, g = 0, b = 0, a = 0;
      if (d <= lensInner) {
        r = 255; g = 255; b = 255; a = 255;
      } else if (d <= lensOuter) {
        r = 29; g = 118; b = 164; a = 255;
      } else {
        const diag = (dx + dy) / Math.SQRT2;
        const perp = (dx - dy) / Math.SQRT2;
        if (diag >= handleStart && diag <= handleEnd && Math.abs(perp) <= handleWidth) {
          r = 29; g = 118; b = 164; a = 255;
        }
      }
      rows.push(r, g, b, a);
    }
  }
  const raw = Buffer.from(rows);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const buf = makeIcon(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
}
