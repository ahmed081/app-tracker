import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { Chart, RankingRow } from '@/api/types';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { preferencesActions } from '@/features/preferences/preferencesSlice';
import { useChartSelection } from '@/features/charts/useChartSelection';
import { useResource } from '@/features/remote/useResource';
import { useFormat } from '@/i18n/format';
import { ChartToolbar } from '@/components/layout/ChartToolbar';
import { AppLabel } from '@/components/app/AppLabel';
import { BumpChart } from '@/components/charts/BumpChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { Panel } from '@/components/ui/Panel';
import { RankBadges } from '@/components/ui/Badges';
import { RankDelta } from '@/components/ui/RankDelta';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';

const NOISE = ['0', '3', '5', '10'] as const;

export function RankingPage() {
  const { t } = useTranslation();
  const selection = useChartSelection();
  if (selection.isLoading) return <SkeletonRows rows={10} />;
  if (selection.error && !selection.charts.length) return <ErrorState error={selection.error} onRetry={selection.reload} />;
  if (!selection.chart) return <EmptyState>{t('charts.notFound')}</EmptyState>;
  return <Ranking chart={selection.chart} charts={selection.charts} />;
}

function Ranking({ chart, charts }: { chart: Chart; charts: Chart[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const dispatch = useAppDispatch();
  const { window: timeWindow, minPlaces } = useAppSelector((s) => s.preferences);
  const [view, setView] = useState<'table' | 'bump'>('table');
  const [limit, setLimit] = useState(25);
  const ranking = useResource('ranking', { chartKey: chart.key, window: timeWindow, limit });
  const bump = useResource('bump', view === 'bump' ? { chartKey: chart.key, window: '7d', top: 8, stepMinutes: 180 } : null);
  const rows = ranking.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('ranking.title', { n: limit })}</h1>
        </div>
        <ChartToolbar charts={charts} chart={chart} />
      </div>

      <Panel
        title={view === 'table' ? t('ranking.tableTitle') : t('ranking.bumpTitle')}
        description={view === 'table' ? t('ranking.tableHint', { window: t(`window.long.${timeWindow}`) }) : t('ranking.bumpHint')}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {view === 'table' && (
              <SegmentedControl size="sm" label={t('ranking.noise')} value={String(minPlaces) as (typeof NOISE)[number]}
                options={NOISE.map((n) => ({ value: n, label: n === '0' ? t('ranking.noiseOff') : t('ranking.noiseMin', { n }) }))}
                onChange={(v) => dispatch(preferencesActions.minPlacesChanged(Number(v)))} />
            )}
            <SegmentedControl size="sm" label={t('ranking.view')} value={view}
              options={[{ value: 'table', label: t('ranking.viewTable') }, { value: 'bump', label: t('ranking.viewBump') }]}
              onChange={setView} />
          </div>
        }
        bodyClassName={view === 'table' ? 'px-0 pb-2' : undefined}
      >
        {view === 'bump' ? (
          bump.isLoading ? <SkeletonRows rows={8} /> : bump.error && !bump.data ? <ErrorState error={bump.error} onRetry={bump.reload} />
            : (bump.data?.series.length ? <BumpChart series={bump.data.series} /> : <EmptyState>{t('state.noData')}</EmptyState>)
        ) : ranking.isLoading ? <SkeletonRows rows={12} className="px-5" />
          : ranking.error && !ranking.data ? <div className="px-5"><ErrorState error={ranking.error} onRetry={ranking.reload} /></div>
            : rows.length === 0 ? <div className="px-5"><EmptyState>{t('ranking.empty')}</EmptyState></div>
              : <RankingTable rows={rows} chartKey={chart.key} minPlaces={minPlaces} windowLabel={t(`window.short.${timeWindow}`)} />}
        {view === 'table' && rows.length > 0 && (
          <div className="flex justify-center px-5 pt-3">
            <button type="button" onClick={() => setLimit(limit === 25 ? 100 : 25)}
              className="rounded-lg border border-line px-4 py-1.5 text-[13px] font-medium text-ink-2 hover:border-line-strong hover:text-ink">
              {limit === 25 ? t('ranking.showMore') : t('ranking.showLess')}
            </button>
          </div>
        )}
      </Panel>

      {view === 'table' && ranking.data && ranking.data.leftChart.length > 0 && (
        <Panel title={t('ranking.leftTitle')} description={t('ranking.leftHint', { when: f.relative(ranking.data.previousAt) })}>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {ranking.data.leftChart.map((l) => (
              <li key={l.app.appleAppId} className="flex items-center gap-3">
                <AppLabel app={l.app} chartKey={chart.key} size={32} className="flex-1" />
                <span className="shrink-0 text-[12.5px] text-ink-2">
                  {l.currentRank != null
                    ? t('ranking.leftWasNow', { was: f.rank(l.previousRank), now: f.rank(l.currentRank) })
                    : t('ranking.leftWas', { was: f.rank(l.previousRank) })}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function RankingTable({ rows, chartKey, minPlaces, windowLabel }: { rows: RankingRow[]; chartKey: string; minPlaces: number; windowLabel: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const th = 'px-3 py-2 text-start text-[12px] font-medium text-ink-3';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <caption className="sr-only">{t('ranking.caption')}</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={cn(th, 'w-16 ps-5 text-end')}>{t('ranking.colRank')}</th>
            <th scope="col" className={cn(th, 'w-16')}>{t('ranking.colChange')}</th>
            <th scope="col" className={th}>{t('ranking.colApp')}</th>
            <th scope="col" className={cn(th, 'w-24')}>{windowLabel}</th>
            <th scope="col" className={cn(th, 'hidden w-28 md:table-cell')}>{t('ranking.colTrend')}</th>
            <th scope="col" className={cn(th, 'hidden w-24 pe-5 lg:table-cell')}>{t('ranking.colRating')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.app.appleAppId} className={cn('border-b border-line/70 last:border-0 hover:bg-surface-2', r.rank === 25 && 'border-b-line-strong')}>
              <td className="ps-5 pe-3 text-end align-middle">
                <span className="tnum text-[17px] font-semibold text-ink">{f.number(r.rank)}</span>
              </td>
              <td className="px-3 align-middle">
                <RankDelta change={r.change} isNew={r.status === 'NEW'} minPlaces={minPlaces} />
              </td>
              <td className="px-3 py-2 align-middle">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <AppLabel app={r.app} chartKey={chartKey} size={36} className="max-w-[min(100%,22rem)]" />
                  <RankBadges badges={r.badges} rising={r.rising} />
                </div>
              </td>
              <td className="px-3 align-middle">
                {r.windowStatus === 'NO_DATA' ? <span className="text-[12px] text-ink-3">{t('state.notEnoughHistory')}</span>
                  : <RankDelta change={r.windowChange} isNew={r.windowStatus === 'NEW'} minPlaces={minPlaces} />}
              </td>
              <td className="hidden px-3 align-middle md:table-cell"><Sparkline points={r.trend} /></td>
              <td className="hidden px-3 pe-5 align-middle text-[13px] text-ink-2 lg:table-cell">
                {r.app.rating != null ? (
                  <span className="inline-flex items-center gap-1 tnum">
                    <Star aria-hidden className="size-3.5 fill-current text-ink-3" />{f.decimal1(r.app.rating)}
                    <span className="text-ink-3">({f.compact(r.app.ratingCount)})</span>
                  </span>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
