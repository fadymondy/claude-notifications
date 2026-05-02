import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Checkbox } from './ui/checkbox';

export function EventsGrid({ def, events, channelConfig, onToggleEvent }) {
  const enabled = new Set(channelConfig?.events || []);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Events that trigger this channel</CardTitle>
        <CardDescription>
          Pick which Claude Code lifecycle events fan out to {def.label}. Don't enable{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">pre-tool</code> or{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">post-tool</code> unless you really
          want noise — they fire many times per turn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-y-2 gap-x-6 sm:grid-cols-2">
          {events.map((ev) => {
            const id = `e-${def.id}-${ev.id}`;
            const isOn = enabled.has(ev.id);
            return (
              <label
                key={ev.id}
                htmlFor={id}
                className="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
              >
                <Checkbox
                  id={id}
                  checked={isOn}
                  onChange={(e) => onToggleEvent(ev.id, e.target.checked)}
                />
                <span>{ev.label}</span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
