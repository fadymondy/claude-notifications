import { useEffect, useMemo, useState } from 'react';
import { ChannelSidebar } from './components/ChannelSidebar';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Field } from './components/Field';
import { SetupSteps } from './components/SetupSteps';
import { EventsList } from './components/EventsList';
import { StatusBar } from './components/StatusBar';
import { UpdateBanner } from './components/UpdateBanner';
import { Play, Save } from 'lucide-react';

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
  return obj;
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
    } else out[k] = v;
  }
  return out;
}

export default function App() {
  const [info, setInfo] = useState({ version: '…', platform: '…' });
  const [channels, setChannels] = useState([]);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState({ channels: {} });
  const [activeId, setActiveId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [voices, setVoices] = useState([]);
  const [systemVoice, setSystemVoice] = useState(null);
  const [status, setStatus] = useState({ message: '', kind: 'info' });

  // Bootstrap: pull schema, config, app info, voices from main.
  useEffect(() => {
    (async () => {
      try {
        const [appInfo, sChannels, sEvents, cfg] = await Promise.all([
          window.cn.appInfo(),
          window.cn.schemaChannels(),
          window.cn.schemaEvents(),
          window.cn.readConfig(),
        ]);
        setInfo(appInfo);
        // Upgrade the desktop channel's voice.name field to the searchable
        // Combobox on every OS — listVoices() returns OS-appropriate entries
        // (NSSpeechSynthesizer on macOS, System.Speech on Windows, spd-say /
        // espeak on Linux) and the picker degrades gracefully when the list
        // is empty.
        const enriched = sChannels.map((c) => {
          if (c.id !== 'desktop') return c;
          return {
            ...c,
            fields: c.fields.map((f) => f.key === 'voice.name' ? { ...f, type: 'voice' } : f),
          };
        });
        setChannels(enriched);
        setEvents(sEvents);
        setConfig(cfg.channels ? cfg : { channels: {} });
        setActiveId(enriched[0]?.id);

        const [list, sysVoice] = await Promise.all([
          window.cn.listVoices(),
          window.cn.systemDefaultVoice?.() ?? Promise.resolve(null),
        ]);
        setVoices(list || []);
        setSystemVoice(sysVoice || null);

        if (!appInfo.pluginRoot) {
          setStatus({
            message: 'Plugin not detected — install with: claude plugin install claude-notifications@claude-notifications',
            kind: 'error',
          });
        }
      } catch (err) {
        setStatus({ message: 'Init failed: ' + err.message, kind: 'error' });
      }
    })();
  }, []);

  // Warn before discarding unsaved edits when navigating channels or closing.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const activeDef = channels.find((c) => c.id === activeId);
  const channelCfg = config.channels?.[activeId] || {};

  const visibleFields = useMemo(() => {
    if (!activeDef) return [];
    return activeDef.fields.filter((f) => {
      if (!f.showWhen) return true;
      return Object.entries(f.showWhen).every(([k, v]) => getPath(channelCfg, k) === v);
    });
  }, [activeDef, channelCfg]);

  function handleSelectChannel(id) {
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return;
    setDirty(false);
    setActiveId(id);
    setStatus({ message: '', kind: 'info' });
  }

  function handleFieldChange(key, value) {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next.channels[activeId]) next.channels[activeId] = {};
      setPath(next.channels[activeId], key, value);
      return next;
    });
    setDirty(true);
  }

  function handleToggleEvent(eventId, on) {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const cur = new Set(next.channels[activeId]?.events || []);
      if (on) cur.add(eventId); else cur.delete(eventId);
      if (!next.channels[activeId]) next.channels[activeId] = {};
      next.channels[activeId].events = Array.from(cur);
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    const cleaned = JSON.parse(JSON.stringify(config));
    for (const cid of Object.keys(cleaned.channels || {})) {
      cleaned.channels[cid] = stripEmpty(cleaned.channels[cid]);
    }
    await window.cn.writeConfig(cleaned);
    const reloaded = await window.cn.readConfig();
    setConfig(reloaded.channels ? reloaded : { channels: {} });
    setDirty(false);
    setStatus({ message: 'Saved.', kind: 'success' });
  }

  async function handleSendTest() {
    if (!activeId) return;
    if (dirty) {
      setStatus({ message: 'You have unsaved changes — saving first…', kind: 'info' });
      await handleSave();
    }
    setStatus({ message: `Sending test through ${activeId}…`, kind: 'info' });
    const r = await window.cn.testChannel(activeId, {
      title: `Test: ${activeId}`,
      body: 'If you see this, the channel is wired up correctly.',
      level: 'info',
    });
    if (r.ok) setStatus({ message: `Test sent through ${activeId}. Check your destination.`, kind: 'success' });
    else setStatus({ message: `Test failed: ${r.error || r.stderr || 'unknown error'}`, kind: 'error' });
  }

  async function handleViewLog() {
    const tail = await window.cn.tailLog(50);
    setStatus({
      message: tail ? `Log tail (last 50 lines):\n${tail}` : 'No log entries yet.',
      kind: 'info',
    });
  }

  if (!activeDef) {
    return <div className="grid h-full place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="grid h-screen grid-cols-[240px_1fr] overflow-hidden">
      <ChannelSidebar
        channels={channels}
        config={config}
        active={activeId}
        onSelect={handleSelectChannel}
        version={info.version}
        platform={info.platform}
        onOpenConfig={() => window.cn.revealConfig()}
        onViewLog={handleViewLog}
      />

      <main className="flex h-screen flex-col overflow-hidden">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b bg-card/60 px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{activeDef.label}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{activeDef.summary}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={handleSendTest}>
              <Play className="h-4 w-4" />
              Send test
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <UpdateBanner currentVersion={info.version} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Configuration</CardTitle>
              <CardDescription>Credentials and channel-specific options.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibleFields.map((f) => (
                  <Field
                    key={f.key}
                    field={f}
                    channelConfig={channelCfg}
                    onChange={handleFieldChange}
                    voiceOptions={voices}
                    systemDefaultVoice={systemVoice}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <SetupSteps
            def={activeDef}
            channelConfig={channelCfg}
            onOpenVoiceSettings={() => window.cn.openVoiceSettings()}
          />

          <EventsList
            def={activeDef}
            events={events}
            channelConfig={channelCfg}
            onToggleEvent={handleToggleEvent}
          />
        </div>

        <StatusBar message={status.message} kind={status.kind} />
      </main>
    </div>
  );
}
