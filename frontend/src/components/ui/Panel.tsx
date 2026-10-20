import type { ReactNode } from 'react';
import { cn } from './cn';

interface PanelProps {
  title?: ReactNode;
  /** Right-aligned controls or a link in the header. */
  action?: ReactNode;
  description?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  as?: 'section' | 'div';
}

/** A titled content area. */
export function Panel({ title, action, description, className, bodyClassName, children, as: Tag = 'section' }: PanelProps) {
  return (
    <Tag className={cn('rounded-xl border border-line bg-surface', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('px-5 pb-5 pt-3', bodyClassName)}>{children}</div>
    </Tag>
  );
}
