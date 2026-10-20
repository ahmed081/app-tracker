import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

interface SelectProps<T extends string> {
  label: string;
  /** Show the label visually above the control (otherwise screen readers only). */
  showLabel?: boolean;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Native select (best on mobile and for accessibility), styled to match. */
export function Select<T extends string>({ label, showLabel, value, options, onChange, className }: SelectProps<T>) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className={showLabel ? 'text-[12px] text-ink-3' : 'sr-only'}>{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}
          className="w-full appearance-none rounded-lg border border-line bg-surface py-1.5 pe-8 ps-3 text-[13px] font-medium text-ink hover:border-line-strong">
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      </div>
    </div>
  );
}
