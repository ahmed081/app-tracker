import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useFormat } from '@/i18n/format';
import { cn } from '@/components/ui/cn';

/** "Updated 12 minutes ago" with the exact time on hover; warns when collection is late. */
export function Freshness({ asOf, delayed, className }: { asOf: string | null | undefined; delayed?: boolean; className?: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!asOf) return <span className={cn('text-[12px] text-ink-3', className)}>{t('freshness.noData')}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px]', delayed ? 'text-down' : 'text-ink-3', className)}
      title={f.dateTime(asOf)}>
      {delayed && <AlertTriangle aria-hidden className="size-3.5" />}
      {t(delayed ? 'freshness.delayed' : 'freshness.updated', { when: f.relative(asOf, now) })}
    </span>
  );
}
