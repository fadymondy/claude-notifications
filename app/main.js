// main.js — Electron main process for the Claude Notifications tray app.
//
// Responsibilities:
//   - System tray icon + context menu (toggle channels, send tests, open settings).
//   - Settings BrowserWindow with a renderer-driven UI.
//   - IPC bridge for read/write of ~/.claude-notifications/config.json.
//   - Invoking the bash dispatcher to run real test sends through the same code
//     path that Claude Code hooks use.

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const config = require('./config');
const { channels: CHANNEL_DEFS, events: EVENT_DEFS } = require('./channels');
const { trayIconBuffer } = require('./icon');

const isDev = process.argv.includes('--dev');
let tray = null;
let settingsWindow = null;

// --- Plugin-root resolution ---------------------------------------------------
// The bash dispatcher lives next to the plugin install. The tray app may run
// standalone (packaged) or be launched from inside the cloned plugin repo.
function resolvePluginRoot() {
  const candidates = [];
  if (process.env.CLAUDE_PLUGIN_ROOT) candidates.push(process.env.CLAUDE_PLUGIN_ROOT);
  // Adjacent to the app sources during dev: ../scripts
  candidates.push(path.join(__dirname, '..'));
  // Default install path used by `claude plugin install`.
  const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-notifications', 'claude-notifications');
  if (fs.existsSync(cacheDir)) {
    const versions = fs.readdirSync(cacheDir).filter(v => fs.existsSync(path.join(cacheDir, v, 'scripts', 'notify.sh')));
    versions.sort().reverse();
    if (versions[0]) candidates.push(path.join(cacheDir, versions[0]));
  }
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'scripts', 'notify.sh'))) return c;
  }
  return null;
}

const PLUGIN_ROOT = resolvePluginRoot();

// --- Bash discovery (Windows fallback) ---------------------------------------
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'bash.exe') : null, // WSL
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

const BASH = findBash();

// --- Notification dispatch ---------------------------------------------------
// Run the bash dispatcher with CN_FORCE_CHANNELS so a tray-initiated test
// hits exactly one channel and bypasses event-routing.
function sendTest(channelId, opts = {}) {
  if (!PLUGIN_ROOT) {
    return { ok: false, error: 'Plugin not installed. Run: claude plugin install claude-notifications@claude-notifications' };
  }
  if (!BASH) {
    return { ok: false, error: 'bash not found. Install Git for Windows or WSL.' };
  }
  const payload = JSON.stringify({
    title: opts.title || 'Channel test',
    body:  opts.body  || `Test from tray app — ${channelId} is wired up.`,
    level: opts.level || 'info',
  });
  const script = path.join(PLUGIN_ROOT, 'scripts', 'notify.sh');
  const env = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    CN_FORCE_CHANNELS: channelId,
  };
  try {
    const r = spawnSync(BASH, [script, 'manual'], { input: payload, env, timeout: 8000 });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: r.status === 0, status: r.status, stderr: r.stderr?.toString().slice(-1000) || '' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Native fallback when the plugin isn't installed yet — at least desktop tests work.
function sendNativeFallback(opts = {}) {
  if (!Notification.isSupported()) return { ok: false, error: 'Native notifications unavailable.' };
  const n = new Notification({
    title: opts.title || 'Claude Notifications',
    body:  opts.body  || 'Tray app is connected. Plugin not installed yet.',
    silent: false,
  });
  n.show();
  return { ok: true, native: true };
}

// --- Tray menu ----------------------------------------------------------------
function buildTrayMenu() {
  const cfg = config.read();
  const channelsCfg = cfg.channels || {};
  const enabledList = CHANNEL_DEFS.filter(c => channelsCfg[c.id]?.enabled).map(c => c.label);
  const status = enabledList.length === 0
    ? 'No channels enabled'
    : `${enabledList.length} enabled — ${enabledList.join(', ')}`;

  const channelToggleItems = CHANNEL_DEFS.map(def => ({
    label: def.label,
    type: 'checkbox',
    checked: !!channelsCfg[def.id]?.enabled,
    click: (item) => {
      config.setChannelEnabled(def.id, item.checked);
      refreshTray();
    },
  }));

  const channelTestItems = CHANNEL_DEFS.map(def => ({
    label: def.label,
    click: () => {
      const r = (PLUGIN_ROOT && BASH) ? sendTest(def.id) : sendNativeFallback({ title: `Test: ${def.label}`, body: 'Plugin not installed.' });
      if (!r.ok) showError(`Test failed for ${def.label}: ${r.error || r.stderr || 'unknown'}`);
    },
  }));

  const template = [
    { label: 'Claude Notifications', enabled: false },
    { label: status, enabled: false },
    { type: 'separator' },
    { label: 'Quick toggle', submenu: channelToggleItems },
    { label: 'Send test notification', submenu: channelTestItems },
    { type: 'separator' },
    { label: 'Settings…', accelerator: 'CommandOrControl+,', click: openSettings },
    { label: 'Open notification log', click: () => {
        if (fs.existsSync(config.LOG_PATH)) shell.openPath(config.LOG_PATH);
        else showError('No log file yet — fire a notification first.');
      } },
    { label: 'Open config file', click: () => shell.openPath(config.CONFIG_PATH) },
    { type: 'separator' },
    { label: PLUGIN_ROOT ? `Plugin: ${truncate(PLUGIN_ROOT, 40)}` : 'Plugin not detected', enabled: false },
    { type: 'separator' },
    { label: 'About', click: () => shell.openExternal('https://github.com/fadymondy/claude-notifications') },
    { label: 'Quit', accelerator: 'CommandOrControl+Q', role: 'quit' },
  ];
  return Menu.buildFromTemplate(template);
}

function truncate(s, n) {
  return s.length > n ? '…' + s.slice(-n) : s;
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  // Update tooltip with status.
  const cfg = config.read();
  const count = Object.values(cfg.channels || {}).filter(c => c?.enabled).length;
  tray.setToolTip(`Claude Notifications — ${count} channel${count === 1 ? '' : 's'} enabled`);
}

function showError(msg) {
  if (Notification.isSupported()) {
    new Notification({ title: 'Claude Notifications', body: msg }).show();
  } else {
    dialog.showErrorBox('Claude Notifications', msg);
  }
}

// --- Settings window ----------------------------------------------------------
function openSettings() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: 'Claude Notifications — Settings',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  if (isDev) settingsWindow.webContents.openDevTools({ mode: 'detach' });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// --- IPC handlers -------------------------------------------------------------
// Enumerate macOS `say` voices into structured records so the renderer can
// build a sensible voice picker. Returns [] on non-macOS or when `say` fails.
function listMacVoices() {
  if (process.platform !== 'darwin') return [];
  try {
    const r = spawnSync('say', ['-v', '?'], { encoding: 'utf8', timeout: 4000 });
    if (r.status !== 0 || !r.stdout) return [];
    const voices = [];
    for (const line of r.stdout.split('\n')) {
      // Locate the locale code (e.g. en_US, fr_FR) anywhere on the line.
      // Same parser the bash desktop handler uses, kept in sync intentionally.
      const m = line.match(/[a-z]{2,3}_[A-Z]{2,3}/);
      if (!m) continue;
      const locale = m[0];
      const name = line.slice(0, m.index).trimEnd();
      if (!name) continue;
      const tail = line.slice(m.index + locale.length).trim();
      const isSiri = /Hi, I.m Siri!/.test(tail);
      const isPremium = /\(Premium\)/.test(name);
      const isEnhanced = /\(Enhanced\)/.test(name);
      voices.push({ name, locale, isSiri, isPremium, isEnhanced });
    }
    // Best-first: Siri > Premium > Enhanced > basic, then alpha within group.
    voices.sort((a, b) => {
      const score = v => (v.isSiri ? 0 : v.isPremium ? 1 : v.isEnhanced ? 2 : 3);
      const sd = score(a) - score(b);
      if (sd !== 0) return sd;
      return a.name.localeCompare(b.name);
    });
    return voices;
  } catch (_) { return []; }
}

function registerIpc() {
  ipcMain.handle('config:read', () => config.read());
  ipcMain.handle('config:write', (_e, cfg) => { config.write(cfg); refreshTray(); return { ok: true }; });
  ipcMain.handle('config:merge', (_e, partial) => { config.merge(partial); refreshTray(); return { ok: true }; });
  ipcMain.handle('config:reveal', () => shell.showItemInFolder(config.CONFIG_PATH));
  ipcMain.handle('log:tail', (_e, lines = 100) => config.tailLog(lines));
  ipcMain.handle('test:channel', (_e, channelId, opts) => sendTest(channelId, opts || {}));
  ipcMain.handle('schema:channels', () => CHANNEL_DEFS);
  ipcMain.handle('schema:events', () => EVENT_DEFS);
  ipcMain.handle('voices:list', () => listMacVoices());
  ipcMain.handle('voices:open-settings', () => {
    if (process.platform !== 'darwin') return { ok: false, error: 'macOS only' };
    shell.openExternal('x-apple.systempreferences:com.apple.preference.universalaccess?Speech');
    return { ok: true };
  });
  ipcMain.handle('voices:preview', (_e, voiceName, text) => {
    if (process.platform !== 'darwin') return { ok: false, error: 'macOS only' };
    if (!voiceName) return { ok: false, error: 'no voice selected' };
    const args = ['-v', voiceName, '--', text || `Hello, this is ${voiceName.split(' (')[0]}.`];
    spawn('say', args, { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    pluginRoot: PLUGIN_ROOT,
    bash: BASH,
    platform: process.platform,
    configPath: config.CONFIG_PATH,
    logPath: config.LOG_PATH,
  }));
}

// --- Lifecycle ----------------------------------------------------------------
app.whenReady().then(() => {
  // Hide the dock icon on macOS — we're a tray app, not a windowed app.
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  const img = nativeImage.createFromBuffer(trayIconBuffer());
  // Mark as macOS template so the OS auto-inverts in light/dark menubar.
  if (process.platform === 'darwin') img.setTemplateImage(true);

  tray = new Tray(img);
  refreshTray();

  registerIpc();

  // Reflect external edits to config (e.g. from `/notify-config`) in the menu.
  try {
    fs.watch(config.CONFIG_DIR, (_evt, name) => {
      if (name === 'config.json') refreshTray();
    });
  } catch (_) { /* ignore — fs.watch is best-effort */ }
});

// Don't quit when all windows close — tray app is the lifecycle anchor.
app.on('window-all-closed', (e) => { e.preventDefault(); });

// Single-instance — clicking the dock/exe again brings up settings.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
}
