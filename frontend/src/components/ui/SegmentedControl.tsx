import { useId, type KeyboardEvent } from 'react';
import { cn } from './cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;               // accessible name of the group
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** A small set of mutually exclusive choices (time windows, ranges). Arrow keys move the selection. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = 'md', className }: SegmentedControlProps<T>) {
  const id = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    const rtl = document.documentElement.dir === 'rtl';
    const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = options[(i + next + options.length) % options.length];
    if (target) {
      onChange(target.value);
      document.getElementById(`${id}-${target.value}`)?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown}
      className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button key={o.value} id={`${id}-${o.value}`} type="button" role="radio" aria-checked={selected}
            tabIndex={selected ? 0 : -1} onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md font-medium tnum transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
              selected ? 'bg-surface text-felt shadow-[0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink',
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
