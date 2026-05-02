import { Logo } from './Logo';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Folder, FileText, Bell, MessageSquare, Mail, Phone, Globe, Webhook, Monitor } from 'lucide-react';

const channelIconMap = {
  desktop: Monitor,
  slack: MessageSquare,
  discord: MessageSquare,
  email: Mail,
  whatsapp: Phone,
  webpush: Globe,
  webhook: Webhook,
};

export function ChannelSidebar({ channels, config, active, onSelect, version, platform, onOpenConfig, onViewLog }) {
  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      <header className="flex items-center gap-3 border-b px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Logo size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Claude Notifications</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            v{version} • {platform}
          </div>
        </div>
      </header>

      <nav className="flex-1 overflow-y-auto p-2">
        {channels.map((def) => {
          const enabled = !!config.channels?.[def.id]?.enabled;
          const isActive = active === def.id;
          const Icon = channelIconMap[def.id] || Bell;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => onSelect(def.id)}
              className={cn(
                'group mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                'hover:bg-secondary',
                isActive && 'bg-primary/10 text-foreground ring-1 ring-primary/40'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' :
                  enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium">{def.label}</span>
              {enabled && <Badge variant="success">on</Badge>}
            </button>
          );
        })}
      </nav>

      <footer className="border-t p-2 space-y-0.5">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onOpenConfig}>
          <Folder className="h-4 w-4" />
          Open config file
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onViewLog}>
          <FileText className="h-4 w-4" />
          View log
        </Button>
      </footer>
    </aside>
  );
}
