import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { Upload, Play, Trash2, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

// Vertical list of channel events with a per-row audio upload slot. Audio
// playback is dispatched by the bash desktop handler from
// ~/.claude-notifications/audio/<channelId>/<eventId>.<ext> — the renderer
// just owns picking/removing/previewing the file.
export function EventsList({ def, events, channelConfig, onToggleEvent }) {
  const enabled = new Set(channelConfig?.events || []);
  const [audioByEvent, setAudioByEvent] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const supportsAudio = def.id === 'desktop'; // playback path lives in desktop.sh

  useEffect(() => {
    if (!supportsAudio) { setAudioByEvent({}); return; }
    let cancelled = false;
    (async () => {
      const m = await window.cn.audio.list(def.id);
      if (!cancelled) setAudioByEvent(m || {});
    })();
    return () => { cancelled = true; };
  }, [def.id, supportsAudio]);

  async function handleUpload(eventId) {
    setBusyKey(eventId);
    try {
      const r = await window.cn.audio.chooseAndSave(def.id, eventId);
      if (r.ok && r.path) {
        setAudioByEvent((prev) => ({ ...prev, [eventId]: r.path }));
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(eventId) {
    setBusyKey(eventId);
    try {
      await window.cn.audio.remove(def.id, eventId);
      setAudioByEvent((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    } finally {
      setBusyKey(null);
    }
  }

  function handlePreview(filePath) {
    window.cn.audio.preview(filePath);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Events that trigger this channel</CardTitle>
        <CardDescription>
          Pick which Claude Code lifecycle events fan out to {def.label}. Don't enable{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">pre-tool</code> or{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">post-tool</code> unless you really
          want noise — they fire many times per turn.
          {supportsAudio && (
            <> Upload an audio file to play that file <em>instead of</em> the spoken voice for that event.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-md border">
          {events.map((ev) => {
            const id = `e-${def.id}-${ev.id}`;
            const isOn = enabled.has(ev.id);
            const audioPath = audioByEvent[ev.id] || null;
            const audioName = audioPath ? audioPath.split('/').pop() : null;
            const busy = busyKey === ev.id;
            return (
              <li
                key={ev.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm',
                  isOn && 'bg-secondary/40'
                )}
              >
                <label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-3 min-w-0">
                  <Checkbox
                    id={id}
                    checked={isOn}
                    onChange={(e) => onToggleEvent(ev.id, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-tight">{ev.label}</div>
                    {audioName && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Music className="h-3 w-3 shrink-0" />
                        <span className="truncate">{audioName}</span>
                      </div>
                    )}
                  </div>
                </label>

                {supportsAudio && (
                  <div className="flex shrink-0 items-center gap-1">
                    {audioPath ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => handlePreview(audioPath)}
                          title="Preview audio"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => handleUpload(ev.id)}
                          title="Replace audio"
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => handleRemove(ev.id)}
                          title="Remove audio"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleUpload(ev.id)}
                      >
                        <Upload className="h-4 w-4" />
                        Upload audio
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
