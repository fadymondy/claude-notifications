// Generates app-icon assets electron-builder needs at build time:
//   build/icons/icon.png   — 1024x1024 (Linux + master / Mac App Store)
//   build/icons/icon.ico   — Windows multi-resolution (16/32/48/64/128/256)
//   build/icons/icon.icns  — macOS multi-resolution (16/32/64/128/256/512/1024)
//
// Source: build/icons/app-icon.svg (rounded squircle + brand bell).
// Renderer: @resvg/resvg-js — pure-JS WASM-backed SVG renderer with platform-
// prebuilt binaries. Same renderer that produces the tray icon, so the bell
// shape stays identical across menubar and dock/installer.
//
// Run:  node build/generate-icons.js

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const SRC = path.join(__dirname, 'icons', 'app-icon.svg');
const OUT = path.join(__dirname, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const SVG = fs.readFileSync(SRC, 'utf8');

function renderSize(size) {
  const r = new Resvg(SVG, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: false },
  });
  return r.render().asPng();
}

// ---- ICO (Windows) — multi-resolution wrapper -------------------------------
function buildIco(sizes) {
  const entries = sizes.map(sz => renderSize(sz));
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

// ---- ICNS (macOS) — multi-resolution PNG-based wrapper ----------------------
// Each entry is a TLV: 4-byte OSType + 4-byte big-endian length + payload.
// We supply both the @1x and @2x variants of each retina pair so macOS picks
// the right one for any DPI.
const ICNS_TYPES = [
  { osType: 'icp4', size: 16  },
  { osType: 'icp5', size: 32  },
  { osType: 'icp6', size: 64  },
  { osType: 'ic07', size: 128 },
  { osType: 'ic08', size: 256 },
  { osType: 'ic09', size: 512 },
  { osType: 'ic10', size: 1024 },
  { osType: 'ic11', size: 32   },  // 16@2x
  { osType: 'ic12', size: 64   },  // 32@2x
  { osType: 'ic13', size: 256  },  // 128@2x
  { osType: 'ic14', size: 512  },  // 256@2x
];

function buildIcns(entries) {
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
console.log('Rendering app-icon.svg at multiple sizes…');
const png1024 = renderSize(1024);
fs.writeFileSync(path.join(OUT, 'icon.png'), png1024);
console.log(`  icon.png:   ${png1024.length} bytes (1024×1024)`);

const ico = buildIco([16, 32, 48, 64, 128, 256]);
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
console.log(`  icon.ico:   ${ico.length} bytes`);

// Cache renders per size to avoid redoing work for icns entries.
const sizeCache = new Map([[1024, png1024]]);
const icnsEntries = ICNS_TYPES.map(({ osType, size }) => {
  if (!sizeCache.has(size)) sizeCache.set(size, renderSize(size));
  return { osType, png: sizeCache.get(size) };
});
const icns = buildIcns(icnsEntries);
fs.writeFileSync(path.join(OUT, 'icon.icns'), icns);
console.log(`  icon.icns:  ${icns.length} bytes`);

// Linux desktop entry expects icon.png in the buildResources dir at multiple
// sizes — electron-builder auto-picks them by name.
for (const sz of [128, 256, 512]) {
  if (!sizeCache.has(sz)) sizeCache.set(sz, renderSize(sz));
  fs.writeFileSync(path.join(OUT, `icon-${sz}.png`), sizeCache.get(sz));
}

console.log('Done.');
