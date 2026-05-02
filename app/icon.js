// Tray icon renderer — uses the actual Boxicons `bxs-bell` SVG, rasterized
// to PNG via @resvg/resvg-js (pure-JS WASM-backed SVG renderer with
// platform-prebuilt binaries). The SVG lives at build/icons/bell.svg so it
// can be edited as a normal vector file.
//
// We render at multiple sizes for HiDPI menubars:
//   trayIconBuffer()    — 22x22 (1x for standard menubar)
//   trayIcon2xBuffer()  — 44x44 (2x for retina displays)
//
// Output is black-on-transparent. macOS template mode (set in main.js) makes
// the OS auto-invert the icon to match the menubar — light backgrounds get
// dark icons, dark backgrounds get light icons.

const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, 'build', 'icons', 'bell.svg');

let cached1x = null;
let cached2x = null;

function loadSvg() {
  return fs.readFileSync(SVG_PATH, 'utf8');
}

function render(size) {
  const { Resvg } = require('@resvg/resvg-js');
  const svg = loadSvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

// Procedural fallback used only when @resvg/resvg-js can't be loaded (e.g.
// a missing prebuilt binary on an exotic platform). Same five-primitive
// composition as before; not as crisp as the real SVG but never fails.
function fallbackPng(size) {
  const zlib = require('zlib');
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = buf => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, c]);
  };
  const inside = (u, v) => {
    if (Math.abs(u - 0.5) <= 0.055 && Math.abs(v - 0.135) <= 0.045) return true;
    if (((u - 0.5) ** 2 + (v - 0.34) ** 2) <= 0.21 ** 2) return true;
    if (Math.abs(u - 0.5) <= 0.21 && v >= 0.34 && v <= 0.62) return true;
    if (Math.abs(u - 0.5) <= 0.34 && Math.abs(v - 0.685) <= 0.06) return true;
    if (((u - 0.5) / 0.075) ** 2 + ((v - 0.85) / 0.06) ** 2 <= 1) return true;
    return false;
  };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  const SS = 5;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      let cnt = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        if (inside((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)) cnt++;
      }
      raw[o++] = 0; raw[o++] = 0; raw[o++] = 0;
      raw[o++] = Math.round(cnt / (SS * SS) * 255);
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function safeRender(size) {
  try {
    return render(size);
  } catch (err) {
    console.warn('claude-notifications: resvg unavailable, using fallback bell —', err.message);
    return fallbackPng(size);
  }
}

function trayIconBuffer() {
  if (!cached1x) cached1x = safeRender(22);
  return cached1x;
}

function trayIcon2xBuffer() {
  if (!cached2x) cached2x = safeRender(44);
  return cached2x;
}

// Re-export for build-time tools (build/generate-icons.js still owns the
// colored app icon; this is just for the monochrome tray glyph).
function buildPng(size) {
  return safeRender(size);
}

module.exports = { trayIconBuffer, trayIcon2xBuffer, buildPng };
