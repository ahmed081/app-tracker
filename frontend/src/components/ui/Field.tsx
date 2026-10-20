import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  /** Already translated message; shown under the control and announced. */
  error?: string;
  className?: string;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label, control, hint and error, wired together for screen readers. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink-2">{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && <p id={errorId} role="alert" className="text-[12px] text-down">{error}</p>}
      {hint && !error && <p id={hintId} className="text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}

export function TextInput({ invalid, describedBy, onChange, className, ...rest }: TextInputProps) {
  return (
    <input {...rest} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-lg border bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-3 hover:border-line-strong',
        invalid ? 'border-down' : 'border-line',
        className,
      )} />
  );
}

interface ToggleChipProps {
  selected: boolean;
  onChange: (selected: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Muted look for a choice that has no effect right now (e.g. a disabled country). */
  muted?: boolean;
}

/** A selectable chip for picking several values (countries, tiers). */
export function ToggleChip({ selected, onChange, children, disabled, muted }: ToggleChipProps) {
  return (
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={() => onChange(!selected)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        selected ? 'border-felt bg-felt-soft text-felt' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
        muted && !selected && 'text-ink-3',
      )}>
      {selected && <Check aria-hidden className="size-3" />}
      {children}
    </button>
  );
}
