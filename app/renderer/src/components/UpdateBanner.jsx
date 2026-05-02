import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '@/lib/utils';
import {
  ArrowDownToLine,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

// Subscribes to the main-process updater state and renders a small banner at
// the top of the settings view. Hidden when state is idle/up-to-date and the
// user hasn't manually clicked check.
export function UpdateBanner({ currentVersion }) {
  const [state, setState] = useState({ phase: 'idle' });
  const [showWhenIdle, setShowWhenIdle] = useState(false);

  useEffect(() => {
    let off = null;
    (async () => {
      const initial = await window.cn.updater.state();
      if (initial) setState(initial);
      off = window.cn.updater.onState(setState);
    })();
    return () => { if (off) off(); };
  }, []);

  async function check() {
    setShowWhenIdle(true);
    await window.cn.updater.check();
  }

  // Render rules:
  //  - hide when idle (unless user just clicked Check)
  //  - hide when up-to-date and not freshly checked
  if (state.phase === 'idle' && !showWhenIdle) return null;
  if (state.phase === 'up-to-date' && !showWhenIdle) return null;
  if (state.phase === 'unsupported') return null; // dev mode — quiet

  return (
    <Card className={cn('flex items-center gap-3 px-4 py-3 shadow-sm border', styleFor(state.phase))}>
      <Icon phase={state.phase} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight">{titleFor(state, currentVersion)}</div>
        {detailFor(state) && (
          <div className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{detailFor(state)}</div>
        )}
      </div>
      <Actions state={state} onCheck={check} />
    </Card>
  );
}

function Icon({ phase }) {
  const cls = 'h-5 w-5 shrink-0';
  switch (phase) {
    case 'checking':    return <RefreshCw className={cn(cls, 'animate-spin text-muted-foreground')} />;
    case 'available':   return <ArrowDownToLine className={cn(cls, 'text-primary')} />;
    case 'downloading': return <ArrowDownToLine className={cn(cls, 'text-primary')} />;
    case 'downloaded':  return <RotateCcw className={cn(cls, 'text-success')} />;
    case 'up-to-date':  return <CheckCircle2 className={cn(cls, 'text-success')} />;
    case 'error':       return <AlertCircle className={cn(cls, 'text-destructive')} />;
    default:            return <RefreshCw className={cls} />;
  }
}

function styleFor(phase) {
  switch (phase) {
    case 'available':
    case 'downloading':
    case 'downloaded':  return 'bg-primary/5 border-primary/30';
    case 'error':       return 'bg-destructive/5 border-destructive/30';
    default:            return '';
  }
}

function titleFor(state, currentVersion) {
  switch (state.phase) {
    case 'checking':    return 'Checking for updates…';
    case 'available':   return `Update available: v${state.version}`;
    case 'downloading': return `Downloading update… ${state.percent != null ? Math.round(state.percent) + '%' : ''}`;
    case 'downloaded':  return `Update v${state.version} ready — restart to install`;
    case 'up-to-date':  return `Up to date (v${currentVersion || state.version})`;
    case 'error':       return 'Update failed';
    default:            return 'Updates';
  }
}

function detailFor(state) {
  switch (state.phase) {
    case 'downloading':
      if (state.bytesPerSecond && state.transferred && state.total) {
        const mb = (state.transferred / 1048576).toFixed(1);
        const tot = (state.total / 1048576).toFixed(1);
        const speed = (state.bytesPerSecond / 1048576).toFixed(2);
        return `${mb} of ${tot} MB · ${speed} MB/s`;
      }
      return null;
    case 'available':
      return state.releaseDate ? `Released ${new Date(state.releaseDate).toLocaleDateString()}` : null;
    case 'error':
      return state.error;
    default:
      return null;
  }
}

function Actions({ state, onCheck }) {
  switch (state.phase) {
    case 'available':
      return (
        <Button size="sm" onClick={() => window.cn.updater.download()}>
          <ArrowDownToLine className="h-4 w-4" />
          Download
        </Button>
      );
    case 'downloaded':
      return (
        <Button size="sm" onClick={() => window.cn.updater.install()}>
          <RotateCcw className="h-4 w-4" />
          Restart now
        </Button>
      );
    case 'error':
      return (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.cn.updater.openReleases()}>
            <ExternalLink className="h-4 w-4" />
            View releases
          </Button>
          <Button size="sm" onClick={onCheck}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      );
    case 'downloading':
    case 'checking':
      return null;
    case 'up-to-date':
    default:
      return (
        <Button size="sm" variant="outline" onClick={onCheck}>
          <RefreshCw className="h-4 w-4" />
          Check again
        </Button>
      );
  }
}
