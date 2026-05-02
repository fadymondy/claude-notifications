// Procedural PNG icon generator for the runtime tray.
//
// Produces a 22x22 (and a 44x44 @2x) full-color branded bell with the red
// notification badge — the same logo used in the app sidebar and packaged
// builds, just smaller. The tray no longer uses template-image mode; the
// colored brand reads better against any menubar.
//
// Returns a Buffer suitable for `nativeImage.createFromBuffer`.

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

// Same primitives as build/generate-icons.js — kept in sync intentionally.
const Y_TOP = 0.18, Y_BODY_TOP = 0.22, Y_BODY_BOT = 0.66, Y_RIM = 0.72, Y_CLAPPER = 0.85;
const W_TOP = 0.30, W_BOT = 0.66;
const DOT_CX = 0.78, DOT_CY = 0.22, DOT_R = 0.13;

function bellCoverage(u, v) {
  if (v >= Y_TOP && v <= Y_BODY_TOP + 0.01) {
    if (Math.abs(u - 0.5) <= 0.05) return 1 - smoothstep(0.04, 0.05, Math.abs(u - 0.5));
  }
  if (v >= Y_BODY_TOP && v <= Y_BODY_BOT) {
    const t = (v - Y_BODY_TOP) / (Y_BODY_BOT - Y_BODY_TOP);
    const widthAtRow = W_TOP + t * (W_BOT - W_TOP);
    return 1 - smoothstep(widthAtRow / 2 - 0.005, widthAtRow / 2 + 0.012, Math.abs(u - 0.5));
  }
  if (v >= Y_BODY_BOT && v <= Y_RIM) {
    return 1 - smoothstep(0.41, 0.43, Math.abs(u - 0.5));
  }
  if (v >= 0.78 && v <= 0.92) {
    const dx = u - 0.5, dy = v - Y_CLAPPER;
    const d = Math.sqrt((dx / 0.06) ** 2 + (dy / 0.05) ** 2);
    return 1 - smoothstep(0.95, 1.05, d);
  }
  return 0;
}

function dotCoverage(u, v) {
  const dx = u - DOT_CX, dy = v - DOT_CY;
  const r = Math.sqrt(dx * dx + dy * dy);
  return 1 - smoothstep(DOT_R - 0.005, DOT_R + 0.01, r);
}

function dotInnerCoverage(u, v) {
  const dx = u - DOT_CX, dy = v - DOT_CY;
  const r = Math.sqrt(dx * dx + dy * dy);
  return 1 - smoothstep(DOT_R * 0.32, DOT_R * 0.42, r);
}

function blendPixel(u, v) {
  const bell = bellCoverage(u, v);
  const dot = dotCoverage(u, v);
  const dotInner = dotInnerCoverage(u, v);

  const bellTop = [255, 138, 61];
  const bellBot = [217, 96, 39];
  const bellMix = Math.max(0, Math.min(1, (v - Y_TOP) / (Y_CLAPPER - Y_TOP)));
  const bellColor = bellTop.map((c, i) => Math.round(c * (1 - bellMix) + bellBot[i] * bellMix));

  const dotOuter = [194, 41, 63];
  const dotOuterTop = [255, 92, 99];
  const dotMix = Math.max(0, Math.min(1, (v - (DOT_CY - DOT_R)) / (2 * DOT_R)));
  const dotColor = dotOuterTop.map((c, i) => Math.round(c * (1 - dotMix) + dotOuter[i] * dotMix));
  const whiteCenter = [255, 255, 255];

  let r = 0, g = 0, b = 0, a = 0;
  if (bell > 0) { r = bellColor[0]; g = bellColor[1]; b = bellColor[2]; a = Math.round(bell * 255); }
  if (dot > 0) {
    const da = Math.round(dot * 255);
    const fa = da / 255;
    r = Math.round(dotColor[0] * fa + r * (1 - fa));
    g = Math.round(dotColor[1] * fa + g * (1 - fa));
    b = Math.round(dotColor[2] * fa + b * (1 - fa));
    a = Math.max(a, da);
  }
  if (dotInner > 0) {
    const ia = Math.round(dotInner * 220);
    const fa = ia / 255;
    r = Math.round(whiteCenter[0] * fa + r * (1 - fa));
    g = Math.round(whiteCenter[1] * fa + g * (1 - fa));
    b = Math.round(whiteCenter[2] * fa + b * (1 - fa));
    a = Math.max(a, ia);
  }
  return [r, g, b, a];
}

function buildPng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  const SS = 3;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const px = blendPixel(u, v);
          r += px[0]; g += px[1]; b += px[2]; a += px[3];
        }
      }
      const N = SS * SS;
      raw[o++] = Math.round(r / N);
      raw[o++] = Math.round(g / N);
      raw[o++] = Math.round(b / N);
      raw[o++] = Math.round(a / N);
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

let cached1x = null;
let cached2x = null;
function trayIconBuffer() {
  if (!cached1x) cached1x = buildPng(W);
  return cached1x;
}
function trayIcon2xBuffer() {
  if (!cached2x) cached2x = buildPng(W * 2);
  return cached2x;
}

module.exports = { trayIconBuffer, trayIcon2xBuffer, buildPng };
