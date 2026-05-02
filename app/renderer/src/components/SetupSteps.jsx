import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Info, ExternalLink, ArrowUpRight } from 'lucide-react';
import { Button } from './ui/button';

export function SetupSteps({ def, channelConfig, onOpenVoiceSettings }) {
  const steps = def.setup || [];
  if (steps.length === 0) return null;
  const provider = channelConfig?.provider;
  const visible = steps.filter(s => !s.providerWhen || s.providerWhen === provider);
  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-primary" />
          How to set up {def.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2.5">
          {visible.map((step, i) => (
            <li
              key={i}
              className="grid grid-cols-[28px_1fr] gap-3 rounded-md border bg-secondary/30 p-3"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                {i + 1}
              </div>
              <div>
                <h4 className="text-sm font-semibold leading-tight">{step.title}</h4>
                <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">{step.detail}</p>
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {step.linkLabel || step.link}
                  </a>
                )}
                {step.linkAction === 'open-voice-settings' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => onOpenVoiceSettings?.()}
                  >
                    <ArrowUpRight className="h-3 w-3" />
                    {step.linkLabel || 'Open settings'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
