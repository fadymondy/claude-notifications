// Renders one field from the channel schema. Pure presentation — value + onChange
// flow comes from the parent.

import { useState } from 'react';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command';
import { Check, ChevronDown, Settings, Play } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

function getPath(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// Pretty label fragment for a voice row — shows badges inline.
function VoiceRowLabel({ voice }) {
  const genderTag = voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : null;
  return (
    <div className="flex w-full items-center gap-2">
      <span className="truncate">{voice.name}</span>
      {genderTag && <span className="text-[11px] text-muted-foreground">{genderTag}</span>}
      <span className="text-[11px] text-muted-foreground">{voice.locale}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {voice.isSiri && (
          <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px]">Siri</span>
        )}
        {voice.isPremium && (
          <span className="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[10px]">Premium</span>
        )}
        {voice.isEnhanced && !voice.isPremium && (
          <span className="rounded-full bg-secondary text-secondary-foreground px-1.5 py-0.5 text-[10px]">Enhanced</span>
        )}
      </span>
    </div>
  );
}

// Searchable Combobox for picking a macOS `say` voice. Renders a sticky
// "macOS System Voice" entry on top that resolves to the user's actual
// system selection (via SelectedVoiceName from speech prefs), so picking
// "(System)" both shows what they'll get and stays consistent if they
// change it later in System Settings.
function VoiceCombobox({ id, value, onChange, voices, systemDefault, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isUnset = value === '' || value == null;
  const selected = isUnset ? null : voices.find(v => v.name === value);

  // What to show in the closed trigger. When unset, we show what bare `say`
  // would actually use (AVSpeechSynthesisVoice's default for the current
  // language) so the user knows what they'll hear without committing it.
  let triggerLabel;
  if (isUnset) {
    triggerLabel = systemDefault
      ? <span className="truncate">macOS System Voice <span className="text-muted-foreground">— {systemDefault.name} ({systemDefault.locale})</span></span>
      : <span className="truncate">macOS System Voice</span>;
  } else if (selected) {
    triggerLabel = <span className="truncate">{selected.name} <span className="text-muted-foreground">— {selected.locale}</span></span>;
  } else {
    triggerLabel = <span className="truncate">{value}</span>;
  }

  function pick(next) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border bg-input px-3 py-1 text-sm shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <span className="flex min-w-0 flex-1 items-center text-left">
            {triggerLabel || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command shouldFilter={true} filter={(v, q) => v.toLowerCase().includes(q.toLowerCase()) ? 1 : 0}>
          <CommandInput
            placeholder="Search voices…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No voices match.</CommandEmpty>
            <CommandGroup heading="Default">
              <CommandItem
                value="__system__ macOS System Voice no override"
                onSelect={() => pick('')}
              >
                <Check className={cn('h-4 w-4 shrink-0', isUnset ? 'opacity-100' : 'opacity-0')} />
                <div className="flex w-full min-w-0 items-center gap-2">
                  <span className="truncate font-medium">macOS System Voice</span>
                  {systemDefault ? (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {systemDefault.name} · {systemDefault.locale}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">recommended — uses bare `say`</span>
                  )}
                </div>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="All voices">
              {voices.map((v) => (
                <CommandItem
                  key={`${v.name}|${v.locale}`}
                  value={`${v.name} ${v.locale}${v.isSiri ? ' siri' : ''}${v.isPremium ? ' premium' : ''}${v.isEnhanced ? ' enhanced' : ''}`}
                  onSelect={() => pick(v.name)}
                >
                  <Check className={cn('h-4 w-4 shrink-0', selected?.name === v.name ? 'opacity-100' : 'opacity-0')} />
                  <VoiceRowLabel voice={v} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Field({ field, channelConfig, onChange, voiceOptions = null, systemDefaultVoice = null }) {
  const value = getPath(channelConfig, field.key);

  // Toggle (special — full row with label + switch).
  if (field.type === 'toggle') {
    const checked = (value ?? field.default) === true;
    return (
      <div className="col-span-full flex items-center justify-between rounded-md border bg-input/50 px-4 py-3">
        <Label htmlFor={`f-${field.key}`} className="text-sm text-foreground font-medium cursor-pointer">
          {field.label}
        </Label>
        <Switch
          id={`f-${field.key}`}
          checked={checked}
          onCheckedChange={(v) => onChange(field.key, v)}
        />
      </div>
    );
  }

  if (field.type === 'select') {
    const options = field.options || [];
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
        <Select value={value ?? field.default ?? options[0]} onValueChange={(v) => onChange(field.key, v)}>
          <SelectTrigger id={`f-${field.key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.help && <p className="text-[11px] text-muted-foreground leading-relaxed">{field.help}</p>}
      </div>
    );
  }

  // Voice picker — opt-in via field.type === 'voice'. Renders a searchable
  // Combobox of available system voices on every OS, plus a button to open
  // the OS's voice-management UI so the user can install more voices.
  if (field.type === 'voice') {
    const placeholder = field.placeholder || '(use system default)';
    const hasVoices = voiceOptions && voiceOptions.length > 0;
    return (
      <div className="space-y-1.5 col-span-full">
        <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            {hasVoices ? (
              <VoiceCombobox
                id={`f-${field.key}`}
                value={value}
                onChange={(v) => onChange(field.key, v)}
                voices={voiceOptions}
                systemDefault={systemDefaultVoice}
                placeholder={placeholder}
              />
            ) : (
              <Input
                id={`f-${field.key}`}
                type="text"
                placeholder={placeholder}
                value={value ?? ''}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.cn.openVoiceSettings()}
            title="Open the OS voice settings to install or change the system voice"
          >
            <Settings className="h-4 w-4" />
            Manage voices
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Leave blank to use whatever your OS picks (macOS System Voice / Windows default voice / Linux Speech Dispatcher default).
          To install a more natural-sounding Siri voice on macOS, click <em>Manage voices</em> →
          ⓘ next to System Voice → Manage Voices → English (US) → check Voice 1–5 / Ava / Tom / Zoe.
        </p>
        {field.help && <p className="text-[11px] text-muted-foreground leading-relaxed">{field.help}</p>}
      </div>
    );
  }

  if (field.type === 'list') {
    const arr = value;
    const text = Array.isArray(arr) ? arr.join('\n') : (arr ?? '');
    return (
      <div className="col-span-full space-y-1.5">
        <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
        <Textarea
          id={`f-${field.key}`}
          value={text}
          placeholder={field.placeholder || 'one per line'}
          onChange={(e) => {
            const lines = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
            onChange(field.key, lines);
          }}
        />
        {field.help && <p className="text-[11px] text-muted-foreground leading-relaxed">{field.help}</p>}
      </div>
    );
  }

  // text / password / number
  const inputType = field.type === 'number' ? 'number' : (field.type === 'password' ? 'password' : 'text');
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
      <Input
        id={`f-${field.key}`}
        type={inputType}
        placeholder={field.placeholder || ''}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(field.key, field.type === 'number' && raw !== '' ? Number(raw) : raw);
        }}
      />
      {field.help && <p className="text-[11px] text-muted-foreground leading-relaxed">{field.help}</p>}
    </div>
  );
}
