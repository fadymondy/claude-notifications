// Reads/writes ~/.claude-notifications/config.json with a JSON-deep-merge so
// editing one channel never wipes out unrelated settings. Same file the bash
// dispatcher reads — the tray app and the hooks share state.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.claude-notifications');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const LOG_PATH = path.join(CONFIG_DIR, 'logs', 'notify.log');

function ensureDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(path.join(CONFIG_DIR, 'logs'), { recursive: true });
}

function read() {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) return { channels: {} };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed.channels) parsed.channels = {};
    return parsed;
  } catch (err) {
    return { channels: {}, _readError: err.message };
  }
}

function write(cfg) {
  ensureDir();
  const json = JSON.stringify(cfg, null, 2) + '\n';
  fs.writeFileSync(CONFIG_PATH, json, { mode: 0o600 });
  // Force restrictive perms even if the file already existed with looser ones.
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch (_) {}
  return cfg;
}

// Deep-merge `partial` into the on-disk config. Arrays are replaced wholesale
// (so events: [] actually clears it). Channel-level merges happen so a UI form
// can post just the changed channel without losing siblings.
function merge(partial) {
  const current = read();
  const merged = deepMerge(current, partial);
  return write(merged);
}

function deepMerge(target, source) {
  if (Array.isArray(source)) return source.slice();
  if (source === null || typeof source !== 'object') return source;
  const out = (target && typeof target === 'object' && !Array.isArray(target)) ? { ...target } : {};
  for (const key of Object.keys(source)) {
    out[key] = deepMerge(out[key], source[key]);
  }
  return out;
}

function setChannelEnabled(name, enabled) {
  const cfg = read();
  if (!cfg.channels[name]) cfg.channels[name] = {};
  cfg.channels[name].enabled = !!enabled;
  return write(cfg);
}

function tailLog(lines = 100) {
  if (!fs.existsSync(LOG_PATH)) return '';
  const data = fs.readFileSync(LOG_PATH, 'utf8');
  const all = data.split('\n');
  return all.slice(Math.max(0, all.length - lines)).join('\n');
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  LOG_PATH,
  read,
  write,
  merge,
  setChannelEnabled,
  tailLog,
};
