import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  /** Shows a spinner and blocks clicks while an action runs. */
  busy?: boolean;
  icon?: ReactNode;
}

const VARIANTS = {
  primary: 'border-felt bg-felt text-surface hover:opacity-90',
  secondary: 'border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border-down/40 bg-surface text-down hover:bg-down-soft',
} as const;

export function Button({ variant = 'secondary', size = 'md', busy, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || busy} aria-busy={busy || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1 text-[12.5px]' : 'px-3 py-1.5 text-[13px]',
        VARIANTS[variant],
        className,
      )} {...rest}>
      {busy ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
