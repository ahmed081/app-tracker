import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowUpRight, CircleDot } from 'lucide-react';
import type { EventRow } from '@/api/types';
import { eventMessage, eventTone } from '@/domain/events';
import { useFormat } from '@/i18n/format';
import { AppIcon } from '@/components/ui/AppIcon';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/States';

const TONE_ICON = { up: ArrowUpRight, down: ArrowDownRight, neutral: CircleDot } as const;
const TONE_CLASS = { up: 'text-up bg-up-soft', down: 'text-down bg-down-soft', neutral: 'text-ink-3 bg-surface-2' } as const;

/** A readable feed of ranking events, newest first. */
export function EventList({ events, showApp = true, empty, compact = false }: {
  events: EventRow[]; showApp?: boolean; empty?: string; compact?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  if (events.length === 0) return <EmptyState>{empty ?? t('events.empty')}</EmptyState>;
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => {
        const tone = eventTone(e);
        const Icon = TONE_ICON[tone];
        const { key, values } = eventMessage(e);
        const sentence = t(key, { ...values, app: showApp ? values.app : t('events.thisApp') });
        return (
          <li key={e.id} className={cn('flex items-start gap-3', compact ? 'py-2' : 'py-2.5')}>
            <span className={cn('mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full', TONE_CLASS[tone])}>
              <Icon aria-hidden className="size-3.5" />
            </span>
            {showApp && e.app && (
              <Link to={`/apps/${e.app.appleAppId}?chart=${encodeURIComponent(e.chart)}`} className="shrink-0" tabIndex={-1} aria-hidden>
                <AppIcon name={e.app.name} url={e.app.iconUrl} seed={e.app.appleAppId} size={24} />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug text-ink">
                {showApp && e.app ? (
                  <Link to={`/apps/${e.app.appleAppId}?chart=${encodeURIComponent(e.chart)}`} className="hover:text-felt hover:underline">
                    {sentence}
                  </Link>
                ) : sentence}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                <time dateTime={e.at} title={f.dateTime(e.at)}>{f.relative(e.at)}</time>
                {e.gap && <span> · {t('events.afterGap')}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
