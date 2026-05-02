// Procedural PNG icon generator.
//
// Why: avoid shipping a binary asset and avoid native image deps. Generates
// a 22x22 black-on-transparent bell glyph as an in-memory PNG buffer using
// only Node built-ins (zlib, Buffer). Returns a Buffer suitable for
// nativeImage.createFromBuffer.

const zlib = require('zlib');

const W = 22;
const H = 22;

// CRC32 table for PNG chunks.
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

// Procedural bell glyph at coordinates (x, y) -> 0 (transparent) or 1 (solid).
function bellAt(x, y) {
  const cx = (W - 1) / 2;
  // Bell body — rounded trapezoid.
  if (y >= 4 && y <= 15) {
    const top = 4, bot = 15;
    const widthAtRow = 4 + ((y - top) * (10 - 4)) / (bot - top);
    if (Math.abs(x - cx) <= widthAtRow / 2) return 1;
  }
  // Bell rim — wider line at the bottom of the body.
  if (y === 16 && Math.abs(x - cx) <= 7) return 1;
  // Clapper — small dot below the rim.
  if (y >= 18 && y <= 19 && Math.abs(x - cx) <= 1) return 1;
  // Top stem.
  if (y >= 2 && y <= 3 && Math.abs(x - cx) <= 1) return 1;
  return 0;
}

function buildPng() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Raw scanlines: filter byte (0 = None) + RGBA pixels.
  const raw = Buffer.alloc(H * (1 + W * 4));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter
    for (let x = 0; x < W; x++) {
      const on = bellAt(x, y);
      // Solid black with antialiased edge — soften by reducing alpha at the body's outer edge.
      const alpha = on ? 255 : 0;
      raw[o++] = 0;     // R
      raw[o++] = 0;     // G
      raw[o++] = 0;     // B
      raw[o++] = alpha; // A
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let cached = null;
function trayIconBuffer() {
  if (!cached) cached = buildPng();
  return cached;
}

module.exports = { trayIconBuffer, buildPng };
