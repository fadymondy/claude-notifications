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

// Boxicons bxs-bell silhouette, composed from a UNION of clean geometric
// primitives so the shape is recognizable at 22px on a menubar:
//
//     Stem (rounded rect)
//          │
//          ▼
//     ┌────────┐         ◄── Bell cap (circle)
//    /          \
//   |   body    |        ◄── Body straight sides (rectangle)
//   |           |
//   ────────────────     ◄── Rim (rounded rect, wider than body)
//          ●             ◄── Clapper (ellipse)
//
// All coordinates are in [0,1] u/v space. Antialiasing comes from 3×3
// supersampling in buildPng() — each primitive returns a hard 0/1 inside-test
// and the average of 9 samples per pixel gives clean edges.

// Signed-distance helpers for AA fallback (kept around for potential future
// use, but the supersampler does the heavy lifting).
function insideCircle(u, v, cx, cy, r) {
  const dx = u - cx, dy = v - cy;
  return Math.sqrt(dx * dx + dy * dy) <= r;
}

function insideRect(u, v, cx, cy, halfW, halfH) {
  return Math.abs(u - cx) <= halfW && Math.abs(v - cy) <= halfH;
}

function insideRoundedRect(u, v, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(u - cx);
  const dy = Math.abs(v - cy);
  if (dx > halfW || dy > halfH) return false;
  // Inside the inner rectangle (away from corners) → trivially inside.
  if (dx <= halfW - r || dy <= halfH - r) return true;
  // Near a corner → inside only if within radius of the corner center.
  const ccx = halfW - r;
  const ccy = halfH - r;
  const ex = dx - ccx;
  const ey = dy - ccy;
  return ex * ex + ey * ey <= r * r;
}

function insideEllipse(u, v, cx, cy, rx, ry) {
  const dx = (u - cx) / rx;
  const dy = (v - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

// Bell-shape parameters tuned for crisp rendering at 22px / 44px.
const STEM   = { cx: 0.50, cy: 0.135, hw: 0.055, hh: 0.045, r: 0.020 };
const CAP    = { cx: 0.50, cy: 0.34,  r:  0.21 };
const BODY   = { cx: 0.50, cy: 0.48,  hw: 0.21, hh: 0.14 };
const RIM    = { cx: 0.50, cy: 0.685, hw: 0.34, hh: 0.06, r: 0.030 };
const CLAP   = { cx: 0.50, cy: 0.85,  rx: 0.075, ry: 0.06 };

function pixelInside(u, v) {
  // Union (any primitive) gives the bell silhouette.
  if (insideRoundedRect(u, v, STEM.cx, STEM.cy, STEM.hw, STEM.hh, STEM.r)) return true;
  if (insideCircle(u, v, CAP.cx, CAP.cy, CAP.r)) return true;
  if (insideRect(u, v, BODY.cx, BODY.cy, BODY.hw, BODY.hh)) return true;
  if (insideRoundedRect(u, v, RIM.cx, RIM.cy, RIM.hw, RIM.hh, RIM.r)) return true;
  if (insideEllipse(u, v, CLAP.cx, CLAP.cy, CLAP.rx, CLAP.ry)) return true;
  return false;
}

function blendPixel(u, v, sampledCoverage) {
  if (sampledCoverage <= 0) return [0, 0, 0, 0];
  const a = Math.round(sampledCoverage * 255);
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
  // Heavier supersampling at the very small tray sizes — 22×22 is unforgiving.
  const SS = size <= 32 ? 5 : 3;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      let inside = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (pixelInside(u, v)) inside++;
        }
      }
      const cov = inside / (SS * SS);
      const px = blendPixel(0, 0, cov);
      raw[o++] = px[0];
      raw[o++] = px[1];
      raw[o++] = px[2];
      raw[o++] = px[3];
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
