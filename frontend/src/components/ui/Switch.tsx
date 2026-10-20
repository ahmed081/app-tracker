import { cn } from './cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (the visible label usually sits next to the switch). */
  label: string;
  disabled?: boolean;
  /** Shows a saving state and blocks clicks. */
  busy?: boolean;
  className?: string;
}

/** An on/off switch. The thumb sits at the inline end when on, so it mirrors in right-to-left. */
export function Switch({ checked, onChange, label, disabled, busy, className }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-busy={busy || undefined}
      disabled={disabled || busy} onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed',
        checked ? 'border-felt bg-felt' : 'border-line-strong bg-surface-2',
        (disabled || busy) && 'opacity-60',
        className,
      )}>
      <span aria-hidden className={cn(
        'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full shadow-sm transition-[inset-inline-start]',
        checked ? 'start-[1.125rem] bg-surface' : 'start-0.5 bg-ink-3',
      )} />
    </button>
  );
}
