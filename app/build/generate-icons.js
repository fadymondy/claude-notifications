// Generates the static icon assets electron-builder needs at build time.
//   build/icons/icon.png      — 512x512 colored branded icon (Linux + master)
//   build/icons/icon.ico      — Windows
//   build/icons/icon.icns     — macOS
//
// The icon is procedurally rendered: warm-orange bell on transparent with
// a red notification badge in the upper-right (matches the in-app SVG logo).
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

// ---- Pixel coverage in [0,1] u/v space -------------------------------------
// Each sampler returns coverage 0..1 for that primitive.

const W_FRAC = 0.3;   // bell shoulder width (relative to canvas)
const W_BOT = 0.66;   // bell base width
const Y_TOP = 0.18;   // top of bell stem
const Y_BODY_TOP = 0.22;
const Y_BODY_BOT = 0.66;
const Y_RIM = 0.72;
const Y_CLAPPER = 0.85;
const DOT_CX = 0.78, DOT_CY = 0.22, DOT_R = 0.13;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bellCoverage(u, v) {
  // Stem
  if (v >= Y_TOP && v <= Y_BODY_TOP + 0.01) {
    const stemHalfW = 0.04;
    if (Math.abs(u - 0.5) <= stemHalfW + 0.01) {
      return Math.max(0, 1 - Math.abs(u - 0.5) / (stemHalfW + 0.01));
    }
  }
  // Body — rounded trapezoid that flares from W_FRAC at top to W_BOT at bottom.
  if (v >= Y_BODY_TOP && v <= Y_BODY_BOT) {
    const t = (v - Y_BODY_TOP) / (Y_BODY_BOT - Y_BODY_TOP);
    const widthAtRow = W_FRAC + t * (W_BOT - W_FRAC);
    const dist = Math.abs(u - 0.5) - widthAtRow / 2;
    // Soft anti-aliased edge
    return 1 - smoothstep(-0.005, 0.01, dist);
  }
  // Rim — slightly wider band at the bottom of the body for a bell flare.
  if (v >= Y_BODY_BOT && v <= Y_RIM) {
    const halfW = 0.42;
    const dist = Math.abs(u - 0.5) - halfW;
    return 1 - smoothstep(-0.005, 0.01, dist);
  }
  // Clapper — small ellipse below the rim.
  if (v >= 0.78 && v <= 0.92) {
    const dx = u - 0.5;
    const dy = v - Y_CLAPPER;
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
  // Returns [r, g, b, a] for one pixel.
  const bell = bellCoverage(u, v);
  const dot = dotCoverage(u, v);
  const dotInner = dotInnerCoverage(u, v);

  // Bell color: warm orange gradient (top lighter, bottom darker).
  const bellTop = [255, 138, 61];
  const bellBot = [217, 96, 39];
  const bellMix = Math.max(0, Math.min(1, (v - Y_TOP) / (Y_CLAPPER - Y_TOP)));
  const bellColor = bellTop.map((c, i) => Math.round(c * (1 - bellMix) + bellBot[i] * bellMix));

  // Notification dot: red gradient + white center.
  const dotOuter = [194, 41, 63];
  const dotOuterTop = [255, 92, 99];
  const dotMix = Math.max(0, Math.min(1, (v - (DOT_CY - DOT_R)) / (2 * DOT_R)));
  const dotColor = dotOuterTop.map((c, i) => Math.round(c * (1 - dotMix) + dotOuter[i] * dotMix));
  const whiteCenter = [255, 255, 255];

  // Layer: bell, then dot on top, then white inner highlight.
  let r = 0, g = 0, b = 0, a = 0;
  if (bell > 0) { r = bellColor[0]; g = bellColor[1]; b = bellColor[2]; a = Math.round(bell * 255); }
  if (dot > 0) {
    const da = Math.round(dot * 255);
    // Composite dot over bell (or transparent).
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
  const W = size, H = size;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(H * (1 + W * 4));
  let o = 0;
  // Supersample 3x3 per output pixel for AA.
  const SS = 3;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / W;
          const v = (y + (sy + 0.5) / SS) / H;
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

// ---- ICO (Windows) — multi-resolution wrapper -------------------------------
function buildIco(sizes) {
  const entries = sizes.map(sz => buildPng(sz));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + 16 * entries.length;
  const dirEntries = entries.map((png, i) => {
    const sz = sizes[i];
    const dir = Buffer.alloc(16);
    dir[0] = sz >= 256 ? 0 : sz;
    dir[1] = sz >= 256 ? 0 : sz;
    dir[2] = 0;
    dir[3] = 0;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    return dir;
  });
  return Buffer.concat([header, ...dirEntries, ...entries]);
}

// ---- ICNS (macOS) — multi-resolution PNG-based --------------------------
function buildIcns(entries) {
  // entries: [{ osType: 'ic09', png: Buffer }, ...]
  const entryBufs = entries.map(({ osType, png }) => {
    const typeBuf = Buffer.from(osType, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(8 + png.length, 0);
    return Buffer.concat([typeBuf, lenBuf, png]);
  });
  const totalLen = 8 + entryBufs.reduce((a, b) => a + b.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLen, 4);
  return Buffer.concat([header, ...entryBufs]);
}

// ---- write all assets --------------------------------------------------------
const png16 = buildPng(16);
const png32 = buildPng(32);
const png48 = buildPng(48);
const png64 = buildPng(64);
const png128 = buildPng(128);
const png256 = buildPng(256);
const png512 = buildPng(512);
const png1024 = buildPng(1024);

fs.writeFileSync(path.join(OUT, 'icon.png'), png512);
fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco([16, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(OUT, 'icon.icns'), buildIcns([
  { osType: 'icp4', png: png16 },   // 16x16
  { osType: 'icp5', png: png32 },   // 32x32
  { osType: 'ic07', png: png128 },  // 128x128
  { osType: 'ic08', png: png256 },  // 256x256
  { osType: 'ic09', png: png512 },  // 512x512
  { osType: 'ic10', png: png1024 }, // 1024x1024
]));
console.log('Wrote icons to', OUT);
