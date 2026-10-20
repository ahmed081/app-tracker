import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from './cn';

type Tone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'border-line bg-surface-2 text-ink-2', icon: 'text-ink-3', Icon: Info },
  success: { box: 'border-up/30 bg-up-soft text-ink', icon: 'text-up', Icon: CircleCheck },
  warning: { box: 'border-warn/40 bg-warn-soft text-ink', icon: 'text-warn', Icon: TriangleAlert },
  error: { box: 'border-down/30 bg-down-soft text-ink', icon: 'text-down', Icon: CircleAlert },
};

/** A short message in a box: a hint, a confirmation, a warning or an error. The icon carries the tone, not colour alone. */
export function Notice({ tone = 'info', title, children, action, className }: {
  tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px]', box, className)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', icon)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}
