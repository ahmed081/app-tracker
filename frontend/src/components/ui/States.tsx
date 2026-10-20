import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

/** Placeholder rows while a list or table loads. */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('state.loading')} className={cn('space-y-2.5', className)}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9" />)}
    </div>
  );
}

/** What went wrong and what to do about it. */
export function ErrorState({ error, onRetry }: { error?: { status: number; message: string }; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = !error ? t('error.generic')
    : error.status === 0 ? t('error.network')
      : error.status === 404 ? t('error.notFound')
        : t('error.server', { status: error.status });
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-2 p-4 text-[13px] text-ink-2">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-2">
          {t('action.retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('rounded-lg bg-surface-2 px-4 py-6 text-center text-[13px] text-ink-3', className)}>{children}</p>;
}
