import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';
import { REASONS, sortReasons } from '@/domain/radar';
import { cn } from '@/components/ui/cn';

const TONE = {
  accent: 'bg-felt-soft text-felt',
  up: 'border border-up/30 text-up',
  neutral: 'border border-line text-ink-2',
} as const;

/** Why an app is on the Radar: one chip per reason, the condition in the tooltip. Green growth chips carry an arrow. */
export function ReasonChips({ reasons, className }: { reasons: readonly string[]; className?: string }) {
  const { t } = useTranslation();
  const shown = sortReasons(reasons);
  if (shown.length === 0) return null;
  return (
    <ul aria-label={t('radar.reasonsLabel')} className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((r) => {
        const tone = REASONS[r].tone;
        return (
          <li key={r} title={t(`radar.reasonHint.${r}`)}
            className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[11px] font-semibold', TONE[tone])}>
            {tone === 'up' && <ArrowUp aria-hidden className="size-3" />}
            {t(`radar.reason.${r}`)}
            <span className="sr-only">: {t(`radar.reasonHint.${r}`)}</span>
          </li>
        );
      })}
    </ul>
  );
}
