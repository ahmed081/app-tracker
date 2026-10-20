import { useTranslation } from 'react-i18next';
import { Crown, TrendingUp } from 'lucide-react';
import type { Badge } from '@/api/types';
import { cn } from './cn';

const ORDER = ['NUMBER_ONE', 'TOP_5', 'TOP_10', 'NEW_ENTRY', 'RE_ENTRY', 'NEW_BEST'];

/**
 * Event badges of the latest reading. Only the most important tier badge is shown
 * (jumping to #1 also entered the Top 10 and Top 5: show "#1" only).
 */
export function RankBadges({ badges, rising, className }: { badges: Badge[]; rising?: boolean; className?: string }) {
  const { t } = useTranslation();
  const sorted = [...new Set(badges)].filter((b) => ORDER.includes(b)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const tier = sorted.find((b) => b === 'NUMBER_ONE' || b.startsWith('TOP_'));
  const shown = [...(tier ? [tier] : []), ...sorted.filter((b) => !b.startsWith('TOP_') && b !== 'NUMBER_ONE').slice(0, 1)];
  if (shown.length === 0 && !rising) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map((b) => (
        <span key={b} className={cn('inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-semibold',
          b === 'NUMBER_ONE' ? 'bg-felt text-surface' : 'bg-felt-soft text-felt')}>
          {b === 'NUMBER_ONE' && <Crown aria-hidden className="size-3" />}
          {t(`badge.${b}`)}
        </span>
      ))}
      {rising && <RisingTag />}
    </span>
  );
}

export function RisingTag({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border border-felt/30 px-1.5 py-px text-[11px] font-semibold text-felt', className)}>
      <TrendingUp aria-hidden className="size-3" />{t('badge.RISING')}
    </span>
  );
}
