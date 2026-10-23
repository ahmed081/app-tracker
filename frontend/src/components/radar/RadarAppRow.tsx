import { useTranslation } from 'react-i18next';
import type { RadarApp } from '@/api/radarTypes';
import { useFormat } from '@/i18n/format';
import { AppLabel } from '@/components/app/AppLabel';
import { FollowButton } from '@/components/app/FollowButton';
import { Sparkline } from '@/components/charts/Sparkline';
import { RankDelta } from '@/components/ui/RankDelta';
import { cn } from '@/components/ui/cn';
import { DismissButton } from './DismissButton';
import { ReasonChips } from './ReasonChips';

/**
 * One app on the Radar: current rank and climb over the period, the app and its
 * chart, why it is here (chips), its trend and the numbers behind the chips.
 */
export function RadarAppRow({ row, chartLabel, showStart = false }: {
  row: RadarApp; chartLabel: (key: string) => string; showStart?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const facts: string[] = [];
  if (showStart && row.startRank != null) facts.push(t('radar.fromRank', { rank: f.rank(row.startRank) }));
  if (row.ageDays != null) facts.push(t('radar.ageDays', { count: row.ageDays }));
  if (row.ratingsGained != null) {
    facts.push(row.ratingsGrowthPercent != null
      ? t('radar.ratingsGainedPercent', { count: row.ratingsGained, percent: f.decimal1(row.ratingsGrowthPercent) })
      : t('radar.ratingsGained', { count: row.ratingsGained }));
  }
  if (row.firstSeenAt) facts.push(t('radar.firstSeen', { when: f.relative(row.firstSeenAt) }));

  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:flex-nowrap', row.dismissed && 'opacity-60')}>
      <div className="flex w-16 shrink-0 flex-col items-end gap-0.5">
        <span className="tnum text-[16px] font-semibold text-ink">{f.rank(row.currentRank)}</span>
        <RankDelta change={row.placesGained} showNone={false} />
      </div>
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        <AppLabel app={row.app} chartKey={row.chart} size={36} />
        <p className="ps-12 text-[12px] text-ink-3">
          {chartLabel(row.chart)}
          {facts.length > 0 && <> · {facts.join(' · ')}</>}
        </p>
        <ReasonChips reasons={row.reasons} className="ps-12" />
      </div>
      <div className="hidden shrink-0 md:block"><Sparkline points={row.trend} /></div>
      <span className="w-14 shrink-0 text-end text-[12px] text-ink-3 tnum" title={t('radar.scoreHint')}>
        {t('radar.score', { score: f.number(row.score) })}
      </span>
      {row.app && (
        <div className="flex shrink-0 items-center">
          <FollowButton target={{ kind: 'APP', appleAppId: row.app.appleAppId, chartKey: row.chart }} name={row.app.name} />
          <DismissButton appleAppId={row.app.appleAppId} name={row.app.name} dismissed={row.dismissed} />
        </div>
      )}
    </li>
  );
}
