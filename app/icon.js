// Procedural PNG icon generator for the runtime tray.
//
// Produces a 22x22 template-style bell (black on transparent) sized for the
// macOS menubar / Windows tray / Linux panel. macOS auto-inverts template
// images for light/dark menubars; Windows/Linux just render the alpha layer.
//
// Returns a Buffer suitable for `nativeImage.createFromBuffer`. Uses the same
// shape primitives as build/generate-icons.js (the colored app icon) so the
// brand stays consistent between the tray glyph and the packaged app icon.

const zlib = require('zlib');

const W = 22;
const H = 22;

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

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Returns coverage 0..1 for the bell silhouette in u,v ∈ [0,1].
function bellCoverage(u, v) {
  const Y_TOP = 0.18, Y_BODY_TOP = 0.22, Y_BODY_BOT = 0.66, Y_RIM = 0.72, Y_CLAPPER = 0.85;
  const W_TOP = 0.30, W_BOT = 0.66;
  // Stem
  if (v >= Y_TOP && v <= Y_BODY_TOP + 0.01) {
    if (Math.abs(u - 0.5) <= 0.05) return 1 - smoothstep(0.04, 0.05, Math.abs(u - 0.5));
  }
  // Body trapezoid with rounded sides
  if (v >= Y_BODY_TOP && v <= Y_BODY_BOT) {
    const t = (v - Y_BODY_TOP) / (Y_BODY_BOT - Y_BODY_TOP);
    const widthAtRow = W_TOP + t * (W_BOT - W_TOP);
    return 1 - smoothstep(widthAtRow / 2 - 0.005, widthAtRow / 2 + 0.012, Math.abs(u - 0.5));
  }
  // Rim flare
  if (v >= Y_BODY_BOT && v <= Y_RIM) {
    return 1 - smoothstep(0.41, 0.43, Math.abs(u - 0.5));
  }
  // Clapper
  if (v >= 0.78 && v <= 0.92) {
    const dx = u - 0.5, dy = v - Y_CLAPPER;
    const d = Math.sqrt((dx / 0.06) ** 2 + (dy / 0.05) ** 2);
    return 1 - smoothstep(0.95, 1.05, d);
  }
  return 0;
}

function buildPng() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(H * (1 + W * 4));
  let o = 0;
  const SS = 3;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / W;
          const v = (y + (sy + 0.5) / SS) / H;
          cov += bellCoverage(u, v);
        }
      }
      const alpha = Math.round((cov / (SS * SS)) * 255);
      raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = alpha;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

let cached = null;
function trayIconBuffer() {
  if (!cached) cached = buildPng();
  return cached;
}

module.exports = { trayIconBuffer, buildPng };
