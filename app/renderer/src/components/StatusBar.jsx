import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export function StatusBar({ message, kind = 'info' }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertCircle : Info;
  const colorClass =
    kind === 'success' ? 'text-success' :
    kind === 'error' ? 'text-destructive' :
    'text-muted-foreground';
  return (
    <footer className="shrink-0 border-t bg-card/40 px-5 py-2 min-h-[44px] flex items-start gap-2.5">
      {message ? (
        <>
          <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', colorClass)} />
          <pre className={cn('whitespace-pre-wrap break-words font-mono text-[12px] flex-1 max-h-20 overflow-y-auto', colorClass)}>
            {message}
          </pre>
        </>
      ) : (
        <span className="text-[12px] text-muted-foreground">Ready.</span>
      )}
    </footer>
  );
}
