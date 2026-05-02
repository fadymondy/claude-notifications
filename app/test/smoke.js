// smoke.js — lightweight tests that run without spinning up Electron.
// Verifies: icon generation, channel/event schemas, config read/write/merge.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${name}`);
    console.error('  ' + (err.stack || err.message));
  }
}

// Use a throwaway HOME so tests never touch the real config.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-smoke-'));
process.env.HOME = TMP;

const icon = require('../icon');
const channelsMod = require('../channels');
const config = require('../config');

test('icon: produces a non-empty PNG buffer with valid signature', () => {
  const buf = icon.trayIconBuffer();
  assert(Buffer.isBuffer(buf), 'expected Buffer');
  assert(buf.length > 64, 'expected sizable PNG');
  assert.deepStrictEqual(
    Array.from(buf.slice(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'PNG signature mismatch'
  );
});

test('icon: caches across calls', () => {
  const a = icon.trayIconBuffer();
  const b = icon.trayIconBuffer();
  assert.strictEqual(a, b, 'expected identical reference');
});

test('schema: every channel has an enabled toggle as its first or known field', () => {
  for (const ch of channelsMod.channels) {
    const has = ch.fields.some(f => f.key === 'enabled' && f.type === 'toggle');
    assert(has, `channel ${ch.id} missing enabled toggle`);
  }
});

test('schema: at least 7 channels and 8 events declared', () => {
  assert(channelsMod.channels.length >= 7, 'too few channels');
  assert(channelsMod.events.length >= 8, 'too few events');
});

test('config: read returns a default shape when file is missing', () => {
  const cfg = config.read();
  assert(cfg && typeof cfg === 'object');
  assert(cfg.channels && typeof cfg.channels === 'object');
});

test('config: write + read round-trips a channel block', () => {
  config.write({ channels: { slack: { enabled: true, webhook_url: 'https://x' } } });
  const got = config.read();
  assert.strictEqual(got.channels.slack.enabled, true);
  assert.strictEqual(got.channels.slack.webhook_url, 'https://x');
});

test('config: setChannelEnabled flips the flag without losing siblings', () => {
  config.write({ channels: { slack: { enabled: true, webhook_url: 'https://x' }, discord: { enabled: false } } });
  config.setChannelEnabled('slack', false);
  const got = config.read();
  assert.strictEqual(got.channels.slack.enabled, false);
  assert.strictEqual(got.channels.slack.webhook_url, 'https://x');
  assert.strictEqual(got.channels.discord.enabled, false);
});

test('config: merge deep-merges nested channel structures', () => {
  config.write({ channels: { whatsapp: { enabled: true, twilio: { account_sid: 'AC1', from: 'old' } } } });
  config.merge({ channels: { whatsapp: { twilio: { from: 'new' } } } });
  const got = config.read();
  assert.strictEqual(got.channels.whatsapp.enabled, true, 'enabled lost');
  assert.strictEqual(got.channels.whatsapp.twilio.account_sid, 'AC1', 'sibling lost');
  assert.strictEqual(got.channels.whatsapp.twilio.from, 'new', 'merge skipped');
});

test('config: file is chmod 600 after write', () => {
  if (process.platform === 'win32') return; // perms semantics differ
  config.write({ channels: {} });
  const st = fs.statSync(config.CONFIG_PATH);
  const mode = st.mode & 0o777;
  assert.strictEqual(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
