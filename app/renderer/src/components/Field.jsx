// Renders one field from the channel schema. Pure presentation — value + onChange
// flow comes from the parent.

import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function getPath(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export function Field({ field, channelConfig, onChange, voiceOptions = null }) {
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

  // Voice picker — opt-in via field.type === 'voice', renders a Select of
  // available macOS voices. Falls back to a plain Input when no voices were
  // discovered (non-macOS).
  if (field.type === 'voice') {
    if (voiceOptions && voiceOptions.length > 0) {
      const placeholder = field.placeholder || '(use macOS System Voice)';
      // Sentinel value used to represent "blank" because Radix Select can't
      // store an empty string as a value.
      const SYSTEM = '__system__';
      const current = value === '' || value == null ? SYSTEM : value;
      return (
        <div className="space-y-1.5 col-span-full">
          <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
          <Select
            value={current}
            onValueChange={(v) => onChange(field.key, v === SYSTEM ? '' : v)}
          >
            <SelectTrigger id={`f-${field.key}`}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value={SYSTEM}>
                <span className="font-medium">macOS System Voice</span>
                <span className="ml-2 text-[11px] text-muted-foreground">(recommended)</span>
              </SelectItem>
              {voiceOptions.map((v) => (
                <SelectItem key={`${v.name}|${v.locale}`} value={v.name}>
                  <div className="flex items-center gap-2">
                    <span>{v.name}</span>
                    <span className="text-[11px] text-muted-foreground">{v.locale}</span>
                    {v.isSiri && <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5">Siri</span>}
                    {v.isPremium && <span className="text-[10px] rounded-full bg-success/15 text-success px-1.5 py-0.5">Premium</span>}
                    {v.isEnhanced && !v.isPremium && <span className="text-[10px] rounded-full bg-secondary text-secondary-foreground px-1.5 py-0.5">Enhanced</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help && <p className="text-[11px] text-muted-foreground leading-relaxed">{field.help}</p>}
        </div>
      );
    }
    // Fall through to text input.
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
