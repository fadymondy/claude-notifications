// Generates the static icon assets electron-builder needs at build time.
//   build/icons/icon.png      — 512x512, used by Linux + as the master
//   build/icons/icon.ico      — Windows multi-resolution
//   build/icons/icon.icns     — macOS icon bundle
//
// Reuses the procedural bell glyph from icon.js. The .ico and .icns generation
// here produces a single-resolution wrapper sufficient for development; for
// production-quality icons, generate from a designed SVG and replace these.
//
// Run:  node build/generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- shared CRC32 + chunk helpers -------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ---- bell shape evaluated at fractional coords for AA -----------------------
function bellPixel(u, v) {
  // Map u,v from [0,1] to a 22-unit canvas matching icon.js for visual parity.
  const x = u * 21;
  const y = v * 21;
  const cx = 10.5;
  if (y >= 4 && y <= 15) {
    const top = 4, bot = 15;
    const widthAtRow = 4 + ((y - top) * (10 - 4)) / (bot - top);
    if (Math.abs(x - cx) <= widthAtRow / 2) return 1;
  }
  if (Math.abs(y - 16) < 0.6 && Math.abs(x - cx) <= 7) return 1;
  if (y >= 18 && y <= 19 && Math.abs(x - cx) <= 1) return 1;
  if (y >= 2 && y <= 3 && Math.abs(x - cx) <= 1) return 1;
  return 0;
}

function buildPng(size) {
  const W = size, H = size;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(H * (1 + W * 4));
  let o = 0;
  // Supersampled AA — 3x3 per output pixel.
  const SS = 3;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      let solid = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / W;
          const v = (y + (sy + 0.5) / SS) / H;
          if (bellPixel(u, v)) solid++;
        }
      }
      const alpha = Math.round((solid / (SS * SS)) * 255);
      raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = alpha;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- ICO (Windows) — wraps a single PNG entry --------------------------------
function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type = icon
  header.writeUInt16LE(1, 4);  // count = 1
  const dir = Buffer.alloc(16);
  dir[0] = size >= 256 ? 0 : size;
  dir[1] = size >= 256 ? 0 : size;
  dir[2] = 0;
  dir[3] = 0;
  dir.writeUInt16LE(1, 4);    // color planes
  dir.writeUInt16LE(32, 6);   // bits per pixel
  dir.writeUInt32LE(pngBuffer.length, 8);
  dir.writeUInt32LE(22, 12);  // offset = 6 + 16
  return Buffer.concat([header, dir, pngBuffer]);
}

// ---- ICNS (macOS) — wraps a single PNG entry --------------------------------
// We use the 'ic09'/'ic10' modern PNG-based types. electron-builder will accept
// this single-size icon for development; for App Store you'd want a full set.
function buildIcns(pngBuffer, size) {
  // OSType for 512x512 = 'ic09', 1024x1024 = 'ic10'.
  const osType = size >= 1024 ? 'ic10' : 'ic09';
  const typeBuf = Buffer.from(osType, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(8 + pngBuffer.length, 0);
  const entry = Buffer.concat([typeBuf, lenBuf, pngBuffer]);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + entry.length, 4);
  return Buffer.concat([header, entry]);
}

// ---- write all assets --------------------------------------------------------
const png512 = buildPng(512);
fs.writeFileSync(path.join(OUT, 'icon.png'), png512);
fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(buildPng(256), 256));
fs.writeFileSync(path.join(OUT, 'icon.icns'), buildIcns(png512, 512));
console.log('Wrote icons to', OUT);
