// Lightweight checkbox styled like the rest of the kit (no Radix dep — we
// barely use it, just a styled native input).
import * as React from 'react';
import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'h-4 w-4 shrink-0 rounded border border-border bg-input text-primary',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'cursor-pointer accent-primary',
      className
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
