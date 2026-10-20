import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { direction } from '@/domain/rank';
import { useFormat } from '@/i18n/format';
import { cn } from './cn';

interface RankDeltaProps {
  /** Places gained (positive = moved up). */
  change: number | null | undefined;
  /** The app was not ranked at the comparison point. */
  isNew?: boolean;
  /** Show "—" instead of nothing when there is no comparison. */
  showNone?: boolean;
  /** Treat moves smaller than this as no movement (noise filter). */
  minPlaces?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** ↑3 / ↓2 / — / NEW, with the meaning spelled out for screen readers. */
export function RankDelta({ change, isNew, showNone = true, minPlaces = 0, size = 'sm', className }: RankDeltaProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const muted = change != null && change !== 0 && Math.abs(change) < minPlaces;
  const dir = muted ? 'same' : direction(change, isNew);
  const text = size === 'lg' ? 'text-[15px]' : size === 'md' ? 'text-[14px]' : 'text-[13px]';
  const icon = size === 'lg' ? 'size-4' : 'size-3.5';

  if (dir === 'none') {
    return showNone ? <span className={cn('text-ink-3', text, className)} aria-label={t('delta.none')}>—</span> : null;
  }
  if (dir === 'new') {
    return (
      <span className={cn('inline-flex items-center gap-1 font-semibold text-felt', text, className)}>
        <Sparkles aria-hidden className={icon} />{t('delta.new')}
      </span>
    );
  }
  if (dir === 'same') {
    return (
      <span className={cn('inline-flex items-center text-ink-3', text, className)} aria-label={t('delta.same')}>
        <Minus aria-hidden className={icon} />
      </span>
    );
  }
  const up = dir === 'up';
  const value = Math.abs(change!);
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold tnum', up ? 'text-up' : 'text-down', text, className)}
      aria-label={t(up ? 'delta.upBy' : 'delta.downBy', { count: value })}>
      {up ? <ArrowUp aria-hidden className={icon} /> : <ArrowDown aria-hidden className={icon} />}
      {f.number(value)}
    </span>
  );
}
