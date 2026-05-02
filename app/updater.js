// updater.js — wraps electron-updater so the rest of main.js doesn't have to
// know about its internals.
//
// Behavior:
//   • On startup (after a 10s grace period), check GitHub Releases for a
//     newer version. Repeat every 4 hours while the app runs.
//   • Lifecycle events (checking / available / not-available / progress /
//     downloaded / error) flow through a single `onState` listener so the
//     tray + settings UI can render whichever state we're in.
//   • The user controls whether to download automatically. When `auto = true`
//     and a new version is found, electron-updater downloads silently and
//     surfaces a "Restart to install" CTA. When `auto = false`, we only
//     notify and let the user click "Download" in the UI.
//
// The publish target is GitHub Releases — same artifacts the release.yml
// workflow uploads (electron-builder generates latest-mac.yml / latest.yml /
// latest-linux.yml metadata files alongside the installers).

const { app, dialog, shell } = require('electron');
const path = require('path');
const log = require('electron-log');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (err) {
  log.warn('electron-updater not loadable —', err.message);
}

log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'updater.log');
log.transports.file.level = 'info';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 10 * 1000;

let started = false;
let intervalHandle = null;
const listeners = new Set();
let lastState = { phase: 'idle' };

function emit(state) {
  lastState = state;
  for (const fn of listeners) {
    try { fn(state); } catch (e) { log.warn('updater listener threw —', e); }
  }
}

function isPackagedAndSupported() {
  // Auto-update only works on a packaged build with a real publish target.
  // Disable in dev — checking would just spam GitHub and confuse the UI.
  if (!app.isPackaged) return false;
  if (!autoUpdater) return false;
  return true;
}

function configure({ autoDownload = false } = {}) {
  if (!isPackagedAndSupported()) return;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = autoDownload;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update',  ()      => emit({ phase: 'checking' }));
  autoUpdater.on('update-available',     (info)  => emit({ phase: 'available',     version: info.version, releaseDate: info.releaseDate }));
  autoUpdater.on('update-not-available', (info)  => emit({ phase: 'up-to-date',    version: info.version }));
  autoUpdater.on('error',                (err)   => emit({ phase: 'error',         error: err?.message || String(err) }));
  autoUpdater.on('download-progress',    (p)     => emit({ phase: 'downloading',   percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }));
  autoUpdater.on('update-downloaded',    (info)  => emit({ phase: 'downloaded',    version: info.version, releaseNotes: info.releaseNotes }));
}

function start({ autoDownload = false } = {}) {
  if (started) return;
  started = true;
  if (!isPackagedAndSupported()) {
    emit({ phase: 'unsupported', reason: app.isPackaged ? 'electron-updater missing' : 'dev mode' });
    return;
  }
  configure({ autoDownload });

  setTimeout(() => { void checkNow(); }, STARTUP_DELAY_MS);
  intervalHandle = setInterval(() => { void checkNow(); }, FOUR_HOURS_MS);
}

async function checkNow() {
  if (!isPackagedAndSupported()) {
    emit({ phase: 'unsupported', reason: app.isPackaged ? 'electron-updater missing' : 'dev mode' });
    return { ok: false, reason: 'unsupported' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, info: result?.updateInfo };
  } catch (err) {
    emit({ phase: 'error', error: err?.message || String(err) });
    return { ok: false, error: err?.message || String(err) };
  }
}

async function downloadNow() {
  if (!isPackagedAndSupported()) return { ok: false, reason: 'unsupported' };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    emit({ phase: 'error', error: err?.message || String(err) });
    return { ok: false, error: err?.message || String(err) };
  }
}

function quitAndInstall() {
  if (!isPackagedAndSupported()) return { ok: false, reason: 'unsupported' };
  // Always restart after install — `isSilent=true, isForceRunAfter=true`.
  autoUpdater.quitAndInstall(true, true);
  return { ok: true };
}

function openLatestRelease() {
  shell.openExternal('https://github.com/fadymondy/claude-notifications/releases/latest');
}

function getState() { return lastState; }

function onState(fn) {
  listeners.add(fn);
  // Fire immediately so a UI subscribing late still gets the current state.
  try { fn(lastState); } catch (_) {}
  return () => listeners.delete(fn);
}

function dispose() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  started = false;
  listeners.clear();
}

module.exports = {
  start,
  checkNow,
  downloadNow,
  quitAndInstall,
  openLatestRelease,
  getState,
  onState,
  dispose,
  isPackagedAndSupported,
};
