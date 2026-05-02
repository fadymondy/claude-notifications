// Renderer for the Settings window. Pulls schemas + config via the cn bridge,
// renders forms dynamically, persists changes back to ~/.claude-notifications/config.json.

const $ = (sel) => document.querySelector(sel);

// el(tag, attrs, ...children). Children may be strings (text), DOM nodes, or
// `{html}` wrappers when raw markup is needed (used for inline icon SVGs).
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c.__html) {
      const tmp = document.createElement('span');
      tmp.innerHTML = c.__html;
      while (tmp.firstChild) node.appendChild(tmp.firstChild);
    }
    else node.appendChild(c);
  }
  return node;
};
const html = (markup) => ({ __html: markup });
const icon = (name, size) => html(window.cnIcons.svg(name, { size: size || 16 }));

let CHANNELS = [];
let EVENTS = [];
let CONFIG = { channels: {} };
let ACTIVE = null;
let DIRTY = false;
let APP_INFO = {};

// --- Helpers for nested-key field paths --------------------------------------
function getPath(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// --- Bootstrap ----------------------------------------------------------------
async function init() {
  const [info, channels, events, cfg] = await Promise.all([
    cn.appInfo(), cn.schemaChannels(), cn.schemaEvents(), cn.readConfig(),
  ]);
  APP_INFO = info;
  CHANNELS = channels;
  EVENTS = events;
  CONFIG = cfg.channels ? cfg : { channels: {} };

  $('#version').textContent = `v${info.version} • ${info.platform}`;

  // Inflate icons in static template buttons (data-icon -> SVG).
  document.querySelectorAll('[data-icon]').forEach(node => {
    node.innerHTML = window.cnIcons.svg(node.dataset.icon, { size: 14 });
  });

  if (!info.pluginRoot) {
    setStatus('Plugin not detected — install with: claude plugin install claude-notifications@claude-notifications', 'error');
  }

  renderSidebar();
  selectChannel(CHANNELS[0].id);

  $('#open-config').addEventListener('click', () => cn.revealConfig());
  $('#view-log').addEventListener('click', async () => {
    const tail = await cn.tailLog(50);
    setStatus(tail ? `Log tail (last 50 lines):\n${tail}` : 'No log entries yet.', 'info');
  });
  $('#save-btn').addEventListener('click', save);
  $('#test-btn').addEventListener('click', sendTest);

  window.addEventListener('beforeunload', (e) => {
    if (DIRTY) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// --- Sidebar ------------------------------------------------------------------
function renderSidebar() {
  const list = $('#channel-list');
  list.innerHTML = '';
  for (const def of CHANNELS) {
    const enabled = !!CONFIG.channels?.[def.id]?.enabled;
    const item = el('div', {
      class: `channel-item${enabled ? ' enabled' : ''}${ACTIVE === def.id ? ' active' : ''}`,
      role: 'button',
      tabindex: '0',
      'data-id': def.id,
      onclick: () => selectChannel(def.id),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectChannel(def.id); } },
    },
      el('span', { class: 'channel-icon' }, html(window.cnIcons.channelIcon(def.id))),
      el('span', { class: 'name' }, def.label),
      enabled ? el('span', { class: 'badge' }, 'on') : null,
    );
    list.appendChild(item);
  }
}

// --- Channel pane -------------------------------------------------------------
function selectChannel(id) {
  if (DIRTY) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
    DIRTY = false;
  }
  ACTIVE = id;
  const def = CHANNELS.find(c => c.id === id);
  $('#channel-title').textContent = def.label;
  $('#channel-summary').textContent = def.summary;
  $('#events-channel-name').textContent = def.label;
  $('#setup-channel-name').textContent = def.label;
  renderForm(def);
  renderSetup(def);
  renderEvents(def);
  renderSidebar();
  clearStatus();
}

function renderForm(def) {
  const form = $('#channel-form');
  form.innerHTML = '';
  const channelCfg = CONFIG.channels[def.id] || {};

  for (const f of def.fields) {
    const wrap = el('div', { class: 'field', 'data-key': f.key });

    if (f.type === 'toggle') {
      const checked = (getPath(channelCfg, f.key) ?? f.default) === true;
      wrap.classList.add('field-toggle');
      wrap.classList.add('field-full');
      const inp = el('input', { type: 'checkbox', id: `f-${f.key}` });
      inp.checked = checked;
      inp.addEventListener('change', () => {
        setPath(channelCfg, f.key, inp.checked);
        CONFIG.channels[def.id] = channelCfg;
        DIRTY = true;
        if (f.key === 'enabled') renderSidebar();
        applyConditionalVisibility(def, channelCfg);
      });
      const switchWrap = el('span', { class: 'toggle-switch' }, inp);
      wrap.appendChild(el('label', { for: `f-${f.key}` }, f.label));
      wrap.appendChild(switchWrap);
    } else if (f.type === 'select') {
      wrap.appendChild(el('label', { for: `f-${f.key}` }, f.label));
      const sel = el('select', { id: `f-${f.key}` });
      for (const opt of f.options) sel.appendChild(el('option', { value: opt }, opt));
      sel.value = getPath(channelCfg, f.key) ?? f.default ?? f.options[0];
      sel.addEventListener('change', () => {
        setPath(channelCfg, f.key, sel.value);
        CONFIG.channels[def.id] = channelCfg;
        DIRTY = true;
        applyConditionalVisibility(def, channelCfg);
        renderSetup(def); // setup steps may change with provider
      });
      wrap.appendChild(sel);
    } else if (f.type === 'list') {
      wrap.classList.add('field-full');
      wrap.appendChild(el('label', { for: `f-${f.key}` }, f.label));
      const ta = el('textarea', { id: `f-${f.key}`, placeholder: f.placeholder || 'one per line' });
      const arr = getPath(channelCfg, f.key);
      ta.value = Array.isArray(arr) ? arr.join('\n') : (arr ?? '');
      ta.addEventListener('input', () => {
        const list = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
        setPath(channelCfg, f.key, list);
        CONFIG.channels[def.id] = channelCfg;
        DIRTY = true;
      });
      wrap.appendChild(ta);
    } else {
      // text / password / number
      wrap.appendChild(el('label', { for: `f-${f.key}` }, f.label));
      const inp = el('input', {
        type: f.type === 'number' ? 'number' : (f.type === 'password' ? 'password' : 'text'),
        id: `f-${f.key}`,
        placeholder: f.placeholder || '',
        spellcheck: 'false',
        autocapitalize: 'off',
      });
      const cur = getPath(channelCfg, f.key);
      inp.value = cur ?? '';
      inp.addEventListener('input', () => {
        let v = inp.value;
        if (f.type === 'number') v = v === '' ? '' : Number(v);
        setPath(channelCfg, f.key, v);
        CONFIG.channels[def.id] = channelCfg;
        DIRTY = true;
      });
      wrap.appendChild(inp);
    }

    if (f.help) wrap.appendChild(el('div', { class: 'help' }, f.help));
    form.appendChild(wrap);
  }
  applyConditionalVisibility(def, channelCfg);
}

function applyConditionalVisibility(def, channelCfg) {
  for (const f of def.fields) {
    if (!f.showWhen) continue;
    const wrap = document.querySelector(`.field[data-key="${CSS.escape(f.key)}"]`);
    if (!wrap) continue;
    const visible = Object.entries(f.showWhen).every(([k, v]) => getPath(channelCfg, k) === v);
    wrap.style.display = visible ? '' : 'none';
  }
}

// --- Setup steps -------------------------------------------------------------
function renderSetup(def) {
  const steps = def.setup || [];
  const list = $('#setup-steps');
  list.innerHTML = '';
  if (steps.length === 0) {
    $('#setup-section').style.display = 'none';
    return;
  }
  $('#setup-section').style.display = '';

  // Filter steps that are gated to a specific provider value.
  const provider = CONFIG.channels[def.id]?.provider;
  const visibleSteps = steps.filter(s => !s.providerWhen || s.providerWhen === provider);

  for (const step of visibleSteps) {
    const li = el('li', { class: 'setup-step' },
      el('div', {},
        el('h3', {}, step.title),
        el('p', {}, step.detail),
        renderStepAction(step),
      ),
    );
    list.appendChild(li);
  }
}

function renderStepAction(step) {
  if (step.linkAction === 'open-voice-settings') {
    return el('button', {
      class: 'step-link',
      type: 'button',
      onclick: async () => { await cn.openVoiceSettings(); },
    }, icon('external'), document.createTextNode(' '), document.createTextNode(step.linkLabel || 'Open settings'));
  }
  if (step.link) {
    return el('a', { href: step.link, target: '_blank', rel: 'noopener noreferrer' },
      icon('external'),
      document.createTextNode(' '),
      document.createTextNode(step.linkLabel || step.link),
    );
  }
  return null;
}

// --- Events grid -------------------------------------------------------------
function renderEvents(def) {
  const grid = $('#events-grid');
  grid.innerHTML = '';
  const channelCfg = CONFIG.channels[def.id] || {};
  const enabledEvents = new Set(channelCfg.events || []);
  for (const ev of EVENTS) {
    const id = `e-${def.id}-${ev.id}`;
    const inp = el('input', { type: 'checkbox', id });
    inp.checked = enabledEvents.has(ev.id);
    inp.addEventListener('change', () => {
      const set = new Set(channelCfg.events || []);
      if (inp.checked) set.add(ev.id); else set.delete(ev.id);
      channelCfg.events = Array.from(set);
      CONFIG.channels[def.id] = channelCfg;
      DIRTY = true;
    });
    grid.appendChild(el('label', { for: id }, inp, document.createTextNode(' ' + ev.label)));
  }
}

// --- Save / Test --------------------------------------------------------------
async function save() {
  const cleaned = JSON.parse(JSON.stringify(CONFIG));
  for (const cid of Object.keys(cleaned.channels || {})) {
    cleaned.channels[cid] = stripEmpty(cleaned.channels[cid]);
  }
  await cn.writeConfig(cleaned);
  CONFIG = await cn.readConfig();
  DIRTY = false;
  renderSidebar();
  setStatus('Saved.', 'success');
}

function stripEmpty(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const sub = stripEmpty(v);
      if (Object.keys(sub).length > 0) out[k] = sub;
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function sendTest() {
  if (!ACTIVE) return;
  if (DIRTY) {
    setStatus('You have unsaved changes — saving first…', 'info');
    await save();
  }
  setStatus(`Sending test through ${ACTIVE}…`, 'info');
  const r = await cn.testChannel(ACTIVE, {
    title: `Test: ${ACTIVE}`,
    body:  'If you see this, the channel is wired up correctly.',
    level: 'info',
  });
  if (r.ok) {
    setStatus(`Test sent through ${ACTIVE}. Check your destination.`, 'success');
  } else {
    setStatus(`Test failed: ${r.error || r.stderr || 'unknown error'}`, 'error');
  }
}

function setStatus(msg, kind = 'info') {
  const node = $('#status-msg');
  node.textContent = msg;
  node.className = `status-msg ${kind}`;
}
function clearStatus() { setStatus(''); }

init().catch((err) => setStatus('Init failed: ' + err.message, 'error'));
