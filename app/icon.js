// Procedural PNG icon generator for the runtime tray.
//
// Produces a monochrome (black-on-transparent) bell silhouette modeled on the
// Boxicons `bxs-bell` glyph — sized for the macOS menubar / Windows tray /
// Linux panel. The tray uses template-image mode on macOS so the OS auto-
// inverts the icon to match the menubar (dark in light mode, white in dark
// mode), exactly like the system icons (Wi-Fi, battery, etc.).
//
// The colored brand bell + notification dot lives in build/generate-icons.js
// instead — that's the dock / installer / about-window icon.
//
// Returns a Buffer suitable for `nativeImage.createFromBuffer`. Provides a 1x
// (22px) and a 2x (44px) representation for HiDPI menubars.

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

// Boxicons bxs-bell silhouette, recreated procedurally so we don't need an SVG
// rasterizer. The shape is a single solid bell glyph — no notification badge
// (the badge is in the colored app/dock icon instead). Coordinates are in
// [0,1] where (0,0) is top-left of the canvas. Tweaked so the glyph reads
// well at 22px / 44px on a menubar.
//
// Body is a rounded "U" with curved shoulders, a small stem on top, a wider
// rim band at the bottom, and a small clapper hanging below.
function bellCoverage(u, v) {
  // Translate u into bell-local x: 0 = vertical centerline.
  const x = u - 0.5;

  // 1. Top stem (small rectangle joining the bell to the centerline).
  if (v >= 0.10 && v <= 0.18) {
    const halfW = 0.06;
    const dist = Math.abs(x) - halfW;
    return 1 - smoothstep(-0.005, 0.012, dist);
  }

  // 2. Bell body — flares from W_TOP at the shoulders to W_BOT at the rim.
  // Use a slightly curved profile so the silhouette looks more like the
  // Boxicons bell than a straight trapezoid.
  if (v >= 0.18 && v <= 0.65) {
    const t = (v - 0.18) / (0.65 - 0.18);     // 0..1 down the body
    // Curve out gently at first, then flare more aggressively near the rim.
    const widthAtRow = 0.30 + 0.32 * Math.pow(t, 0.85);
    const dist = Math.abs(x) - widthAtRow / 2;
    return 1 - smoothstep(-0.005, 0.012, dist);
  }

  // 3. Rim — wider band at the bottom of the body that gives the bell its flare.
  if (v >= 0.65 && v <= 0.74) {
    // Slightly pinched at top of rim, full width at bottom.
    const t = (v - 0.65) / 0.09;
    const halfW = 0.42 + 0.04 * t;
    const dist = Math.abs(x) - halfW;
    return 1 - smoothstep(-0.005, 0.012, dist);
  }

  // 4. Rim bottom edge curve — small radius rounding so the bottom of the
  // rim isn't visually flat.
  if (v >= 0.74 && v <= 0.78) {
    const cy = 0.74;
    const halfW = 0.46;
    if (Math.abs(x) <= halfW - 0.02) {
      const dy = v - cy;
      return 1 - smoothstep(0.04 - 0.005, 0.04 + 0.012, dy);
    }
  }

  // 5. Clapper — small ellipse hanging below the rim.
  if (v >= 0.78 && v <= 0.92) {
    const dx = x;
    const dy = v - 0.85;
    const d = Math.sqrt((dx / 0.07) ** 2 + (dy / 0.06) ** 2);
    return 1 - smoothstep(0.95, 1.05, d);
  }

  return 0;
}

function blendPixel(u, v) {
  const cov = bellCoverage(u, v);
  if (cov <= 0) return [0, 0, 0, 0];
  const a = Math.round(cov * 255);
  // Pure black RGB; alpha carries the antialiased coverage. macOS template
  // mode reads only the alpha channel and recolors the icon for the menubar.
  return [0, 0, 0, a];
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
