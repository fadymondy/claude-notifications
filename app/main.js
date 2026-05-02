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
const { trayIconBuffer, trayIcon2xBuffer } = require('./icon');
const updater = require('./updater');

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

  const updaterState = updater.getState();
  const updateItems = buildUpdateMenuItems(updaterState);

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
    ...updateItems,
    { label: PLUGIN_ROOT ? `Plugin: ${truncate(PLUGIN_ROOT, 40)}` : 'Plugin not detected', enabled: false },
    { type: 'separator' },
    { label: 'About', click: () => shell.openExternal('https://github.com/fadymondy/claude-notifications') },
    { label: 'Quit', accelerator: 'CommandOrControl+Q', role: 'quit' },
  ];
  return Menu.buildFromTemplate(template);
}

// Render the update section of the tray menu based on the current updater
// state. The label changes from "Check for updates" → "Downloading… 42%" →
// "Restart to install vX.Y.Z" so a glance at the menubar tells you where you
// are without opening Settings.
function buildUpdateMenuItems(state) {
  const items = [];
  switch (state?.phase) {
    case 'checking':
      items.push({ label: 'Checking for updates…', enabled: false });
      break;
    case 'available':
      items.push({ label: `Update available — v${state.version}`, click: () => updater.downloadNow() });
      break;
    case 'downloading': {
      const pct = state.percent != null ? `${Math.round(state.percent)}%` : '…';
      items.push({ label: `Downloading update — ${pct}`, enabled: false });
      break;
    }
    case 'downloaded':
      items.push({ label: `Restart to install v${state.version}`, click: () => updater.quitAndInstall() });
      break;
    case 'error':
      items.push({ label: `Update failed: ${truncate(state.error || '', 40)}`, click: () => updater.openLatestRelease() });
      items.push({ label: 'Check again', click: () => updater.checkNow() });
      break;
    case 'unsupported':
      // Dev mode or unsupported platform — just point at GitHub.
      items.push({ label: 'View releases on GitHub', click: () => updater.openLatestRelease() });
      break;
    case 'up-to-date':
    case 'idle':
    default:
      items.push({ label: 'Check for updates…', click: () => updater.checkNow() });
      break;
  }
  items.push({ type: 'separator' });
  return items;
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
  // In dev, point at the Vite dev server (CN_DEV_URL set by `npm run dev`).
  // In production / pack, load the built static bundle.
  const devUrl = process.env.CN_DEV_URL;
  if (devUrl) {
    settingsWindow.loadURL(devUrl);
  } else {
    settingsWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  if (isDev) settingsWindow.webContents.openDevTools({ mode: 'detach' });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// --- IPC handlers -------------------------------------------------------------
// Enumerate macOS `say` voices into structured records so the renderer can
// build a sensible voice picker. Returns [] on non-macOS or when `say` fails.
// Enumerate Windows TTS voices via PowerShell System.Speech. Returns the
// same shape as listMacVoices() so the renderer can render them with the
// same Combobox.
function listWindowsVoices() {
  if (process.platform !== 'win32') return [];
  try {
    const ps = `Add-Type -AssemblyName System.Speech;
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$s.GetInstalledVoices() | ForEach-Object {
  $i = $_.VoiceInfo;
  [pscustomobject]@{ name = $i.Name; locale = $i.Culture.Name; gender = $i.Gender.ToString() }
} | ConvertTo-Json -Compress`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 6000 });
    if (r.status !== 0 || !r.stdout) return [];
    const arr = JSON.parse(r.stdout);
    const list = Array.isArray(arr) ? arr : [arr];
    return list.map(v => ({
      name: v.name,
      locale: (v.locale || '').replace('-', '_'),
      isSiri: false,
      isPremium: false,
      isEnhanced: false,
      gender: (v.gender || '').toLowerCase(),
    }));
  } catch (_) { return []; }
}

// Enumerate Linux voices best-effort via spd-say -L (Speech Dispatcher) or
// espeak --voices. Returns a common shape; gender unknown.
function listLinuxVoices() {
  if (process.platform !== 'linux') return [];
  try {
    let r = spawnSync('spd-say', ['-L'], { encoding: 'utf8', timeout: 4000 });
    if (r.status === 0 && r.stdout) {
      const out = [];
      for (const line of r.stdout.split('\n')) {
        const m = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)/);
        if (m) out.push({ name: m[1], locale: m[2], isSiri: false, isPremium: false, isEnhanced: false, gender: 'unspecified' });
      }
      if (out.length > 0) return out;
    }
    r = spawnSync('espeak', ['--voices'], { encoding: 'utf8', timeout: 4000 });
    if (r.status === 0 && r.stdout) {
      const out = [];
      const lines = r.stdout.split('\n').slice(1); // skip header
      for (const line of lines) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 4) continue;
        out.push({
          name: cols[3],
          locale: cols[1] || '',
          isSiri: false, isPremium: false, isEnhanced: false,
          gender: cols[2]?.startsWith('M') ? 'male' : cols[2]?.startsWith('F') ? 'female' : 'unspecified',
        });
      }
      return out;
    }
    return [];
  } catch (_) { return []; }
}

// One-shot probe of NSSpeechSynthesizer to get a {name → gender} map.
// `say -v ?` doesn't print gender, but NSSpeechSynthesizer.attributesForVoice
// does — so we cross-reference by display name.
function probeVoiceGenders() {
  if (process.platform !== 'darwin') return {};
  try {
    const script = `
      ObjC.import("AppKit");
      const ids = $.NSSpeechSynthesizer.availableVoices;
      const out = {};
      for (let i = 0; i < ids.count; i++) {
        const id = ids.objectAtIndex(i);
        const a = $.NSSpeechSynthesizer.attributesForVoice(id);
        const name = a.objectForKey("VoiceName");
        const g = a.objectForKey("VoiceGender");
        if (name && g) {
          // Map "VoiceGenderFemale" → "female", etc.
          const tag = g.js.replace(/^VoiceGender/, "").toLowerCase();
          out[name.js] = tag;
        }
      }
      JSON.stringify(out);
    `;
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout: 4000 });
    if (r.status !== 0 || !r.stdout) return {};
    return JSON.parse(r.stdout.trim());
  } catch (_) { return {}; }
}

function listMacVoices() {
  if (process.platform !== 'darwin') return [];
  try {
    const r = spawnSync('say', ['-v', '?'], { encoding: 'utf8', timeout: 4000 });
    if (r.status !== 0 || !r.stdout) return [];
    const genders = probeVoiceGenders();
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
      const gender = genders[name] || 'unspecified'; // 'female' | 'male' | 'neuter' | 'unspecified'
      voices.push({ name, locale, isSiri, isPremium, isEnhanced, gender });
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

// Resolve the user's current macOS System Voice (the one selected in
// System Settings → Accessibility → Spoken Content) to a row from
// listMacVoices(). Returns null on non-macOS, or when the pref is unset
// and we can't make a confident match.
//
// macOS stores the pref like this:
//   SelectedVoiceCreator = 1886745202;
//   SelectedVoiceID = 220;
//   SelectedVoiceName = "com.apple.speech.synthesis.voice.samantha";
// The short tail after the last "." is what we match against the display
// name returned by `say -v ?`.
function getSystemDefaultVoice(voices) {
  if (process.platform !== 'darwin') return null;
  if (!voices || voices.length === 0) return null;

  const score = v => (v.isSiri ? 0 : v.isPremium ? 1 : v.isEnhanced ? 2 : 3);
  const matchByShortName = (short) => {
    const cand = voices.filter(v => v.name.split(/\s|\(/)[0].toLowerCase() === short.toLowerCase());
    cand.sort((a, b) => score(a) - score(b));
    return cand[0] || null;
  };

  // 1) Explicit pref — what the user picked in System Settings → Accessibility
  // → Spoken Content. macOS only sets this when the user actively chooses a
  // voice; on a stock install the key is missing.
  try {
    const r = spawnSync('defaults', ['read', 'com.apple.speech.voice.prefs', 'SelectedVoiceName'], {
      encoding: 'utf8', timeout: 2000,
    });
    if (r.status === 0 && r.stdout) {
      const short = r.stdout.trim().replace(/^com\.apple\.speech\.synthesis\.voice\./i, '');
      if (short) {
        const hit = matchByShortName(short);
        if (hit) return hit;
      }
    }
  } catch (_) { /* fall through */ }

  // 2) Authoritative fallback — ask AVSpeechSynthesisVoice for the default
  // voice of the system's current language. This is what `say` itself uses
  // when no -v is passed, and it correctly resolves regions (e.g. en_EG
  // routes to en-US Samantha because there's no en_EG voice installed).
  try {
    const script = `
      ObjC.import("AVFoundation");
      const lang = $.AVSpeechSynthesisVoice.currentLanguageCode.js;
      const def  = $.AVSpeechSynthesisVoice.voiceWithLanguage(lang);
      JSON.stringify({ name: def.name.js, identifier: def.identifier.js, language: lang });
    `;
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout: 4000 });
    if (r.status === 0 && r.stdout) {
      const info = JSON.parse(r.stdout.trim());
      // Try matching by display name first, then by id tail.
      const byName = matchByShortName(info.name);
      if (byName) return byName;
      const idTail = (info.identifier || '').split('.').pop();
      if (idTail) {
        const byId = matchByShortName(idTail);
        if (byId) return byId;
      }
    }
  } catch (_) { /* fall through */ }

  // 3) Last-ditch: language-family match. Only hits when the JXA probe is
  // blocked (e.g. sandboxed builds).
  let appLang = 'en';
  try {
    const r = spawnSync('defaults', ['read', '-g', 'AppleLanguages'], { encoding: 'utf8', timeout: 2000 });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.match(/"([a-z]{2,3})[-_]/);
      if (m) appLang = m[1];
    }
  } catch (_) { /* ignore */ }
  const byLang = voices.filter(v => v.locale.startsWith(appLang + '_')).sort((a, b) => score(a) - score(b));
  return byLang[0] || null;
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
  ipcMain.handle('voices:list', () => {
    if (process.platform === 'darwin') return listMacVoices();
    if (process.platform === 'win32')  return listWindowsVoices();
    if (process.platform === 'linux')  return listLinuxVoices();
    return [];
  });
  ipcMain.handle('voices:system-default', () => {
    const list = listMacVoices();
    return getSystemDefaultVoice(list);
  });
  ipcMain.handle('voices:open-settings', () => {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.universalaccess?Speech');
      return { ok: true };
    }
    if (process.platform === 'win32') {
      shell.openExternal('ms-settings:speech');
      return { ok: true };
    }
    if (process.platform === 'linux') {
      // No standard deeplink — point at the Speech Dispatcher manual.
      shell.openExternal('https://htmlpreview.github.io/?https://github.com/brailcom/speechd/blob/master/doc/speech-dispatcher.html');
      return { ok: true, hint: 'Linux: edit ~/.config/speech-dispatcher/ or install voices via your distro\'s package manager.' };
    }
    return { ok: false, error: 'unsupported platform' };
  });
  ipcMain.handle('voices:preview', (_e, voiceName, text) => {
    if (process.platform !== 'darwin') return { ok: false, error: 'macOS only' };
    if (!voiceName) return { ok: false, error: 'no voice selected' };
    const args = ['-v', voiceName, '--', text || `Hello, this is ${voiceName.split(' (')[0]}.`];
    spawn('say', args, { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  });

  // Per-event audio uploads. Files live under
  // ~/.claude-notifications/audio/<channelId>/<eventId>.<ext> so the bash
  // dispatcher can locate them deterministically without parsing JSON paths.
  const AUDIO_DIR = path.join(config.CONFIG_DIR, 'audio');
  const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'aiff', 'ogg', 'flac'];

  function audioDir(channelId) {
    return path.join(AUDIO_DIR, channelId);
  }
  function findExistingAudio(channelId, eventId) {
    const dir = audioDir(channelId);
    if (!fs.existsSync(dir)) return null;
    for (const ext of AUDIO_EXTENSIONS) {
      const p = path.join(dir, `${eventId}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  ipcMain.handle('audio:choose-and-save', async (_e, channelId, eventId) => {
    if (!channelId || !eventId) return { ok: false, error: 'missing channel or event id' };
    const r = await dialog.showOpenDialog({
      title: `Choose audio for ${eventId}`,
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    });
    if (r.canceled || !r.filePaths?.[0]) return { ok: false, canceled: true };
    const src = r.filePaths[0];
    const ext = (path.extname(src).slice(1) || 'mp3').toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      return { ok: false, error: `unsupported extension .${ext}` };
    }
    const dir = audioDir(channelId);
    fs.mkdirSync(dir, { recursive: true });
    // Wipe any existing entry for this event with a different extension —
    // there's only one file per event.
    for (const e of AUDIO_EXTENSIONS) {
      const p = path.join(dir, `${eventId}.${e}`);
      if (p !== path.join(dir, `${eventId}.${ext}`) && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
    const dest = path.join(dir, `${eventId}.${ext}`);
    fs.copyFileSync(src, dest);
    return { ok: true, path: dest, name: path.basename(src) };
  });

  ipcMain.handle('audio:remove', (_e, channelId, eventId) => {
    if (!channelId || !eventId) return { ok: false, error: 'missing id' };
    const existing = findExistingAudio(channelId, eventId);
    if (!existing) return { ok: true, removed: false };
    try {
      fs.unlinkSync(existing);
      return { ok: true, removed: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('audio:list', (_e, channelId) => {
    if (!channelId) return {};
    const dir = audioDir(channelId);
    if (!fs.existsSync(dir)) return {};
    const out = {};
    for (const file of fs.readdirSync(dir)) {
      const m = file.match(/^(.+)\.([a-z0-9]+)$/i);
      if (!m) continue;
      const [, eventId, ext] = m;
      if (!AUDIO_EXTENSIONS.includes(ext.toLowerCase())) continue;
      out[eventId] = path.join(dir, file);
    }
    return out;
  });

  ipcMain.handle('audio:preview', (_e, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'file not found' };
    if (process.platform === 'darwin') {
      spawn('afplay', [filePath], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    if (process.platform === 'linux') {
      const player = ['paplay', 'aplay', 'mpg123', 'ffplay'].find(p => spawnSync('which', [p]).status === 0);
      if (!player) return { ok: false, error: 'install paplay/aplay/mpg123/ffplay to preview' };
      spawn(player, [filePath], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    if (process.platform === 'win32') {
      const ps = `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`;
      spawn('powershell.exe', ['-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    return { ok: false, error: 'unsupported platform' };
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    pluginRoot: PLUGIN_ROOT,
    bash: BASH,
    platform: process.platform,
    configPath: config.CONFIG_PATH,
    logPath: config.LOG_PATH,
    updaterSupported: updater.isPackagedAndSupported(),
  }));

  ipcMain.handle('updater:state',          () => updater.getState());
  ipcMain.handle('updater:check',          () => updater.checkNow());
  ipcMain.handle('updater:download',       () => updater.downloadNow());
  ipcMain.handle('updater:install',        () => updater.quitAndInstall());
  ipcMain.handle('updater:open-releases',  () => updater.openLatestRelease());

  // Push state changes to every open window so the settings view stays live
  // without polling. UI subscribes in preload via onUpdaterState().
  updater.onState((state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('updater:state', state);
    }
    // When an update lands, refresh the tray menu so its label flips.
    refreshTray();
  });
}

// --- Lifecycle ----------------------------------------------------------------
app.whenReady().then(() => {
  // Hide the dock icon on macOS — we're a tray app, not a windowed app.
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  // Build a Retina-aware monochrome tray icon. We add the 2x representation
  // for HiDPI displays and mark it as a template image on macOS so the OS
  // auto-inverts it to match the menubar (dark in light mode, white in dark
  // mode) — same behavior as built-in icons like Wi-Fi or battery.
  const img = nativeImage.createFromBuffer(trayIconBuffer(), { width: 22, height: 22 });
  img.addRepresentation({
    width: 22, height: 22, scaleFactor: 2.0,
    buffer: trayIcon2xBuffer(),
  });
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

  // Kick off the auto-updater. Runs once after a 10s delay then every 4h.
  // No-op in dev (app.isPackaged === false) so we don't spam GitHub during
  // development.
  updater.start({ autoDownload: false });
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
