import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Star } from 'lucide-react';
import type { Chart, EventRow } from '@/api/types';
import type { WatchedApp, WatchedChart } from '@/api/watchTypes';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { chartPath, parseChartKey } from '@/domain/charts';
import { eventMessage } from '@/domain/events';
import { filterWatchlist, lineTarget, watchlistCharts } from '@/domain/watch';
import { preferencesActions, WINDOWS, type TimeWindow } from '@/features/preferences/preferencesSlice';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { AppLabel } from '@/components/app/AppLabel';
import { FollowButton } from '@/components/app/FollowButton';
import { Sparkline } from '@/components/charts/Sparkline';
import { Panel } from '@/components/ui/Panel';
import { RankDelta } from '@/components/ui/RankDelta';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';

const NO_PARAMS = {} as Record<string, never>;

/** Everything followed: apps (a line per chart) and charts (their #1 and latest big moment). */
export function WatchlistPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const dispatch = useAppDispatch();
  const { window: timeWindow, chartKey: remembered } = useAppSelector((s) => s.preferences);
  const [chartFilter, setChartFilter] = useState('all');
  const watchlist = useResource('watchlist', { window: timeWindow });
  const charts = useResource('charts', NO_PARAMS);
  const chartLabel = useChartLabel(charts.data ?? []);

  const data = watchlist.data;
  const keys = data ? watchlistCharts(data) : [];
  const filter = keys.includes(chartFilter) ? chartFilter : 'all';
  const shown = data ? filterWatchlist(data, filter) : undefined;
  const empty = data !== undefined && data.apps.length === 0 && data.charts.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('watchlist.title')}</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">{t('watchlist.subtitle')}</p>
        </div>
        {!empty && (
          <div className="flex flex-wrap items-end gap-3">
            <Select label={t('watchlist.chartFilter')} showLabel value={filter} onChange={setChartFilter} className="w-72 max-w-full"
              options={[{ value: 'all', label: t('watchlist.allCharts') }, ...keys.map((k) => ({ value: k, label: chartLabel(k) }))]} />
            <div className="flex flex-col gap-1">
              <span aria-hidden className="text-[12px] text-ink-3">{t('window.label')}</span>
              <SegmentedControl label={t('window.label')} value={timeWindow}
                options={WINDOWS.map((w) => ({ value: w, label: t(`window.short.${w}`) }))}
                onChange={(w: TimeWindow) => dispatch(preferencesActions.windowChanged(w))} />
            </div>
            {data?.asOf && <p className="ms-auto pb-2 text-[12.5px] text-ink-3">{t('watchlist.asOf', { when: f.relative(data.asOf) })}</p>}
          </div>
        )}
      </div>

      {watchlist.isLoading ? <SkeletonRows rows={8} />
        : watchlist.error && !data ? <ErrorState error={watchlist.error} onRetry={watchlist.reload} />
          : empty ? <EmptyWatchlist chartKey={remembered} />
            : (
              <>
                <Panel title={t('watchlist.appsTitle')} description={t('watchlist.appsHint', { window: t(`window.long.${timeWindow}`) })}
                  bodyClassName="px-0 pb-2">
                  {shown!.apps.length === 0
                    ? <div className="px-5"><EmptyState>{t('watchlist.noApps')}</EmptyState></div>
                    : <AppLines lines={shown!.apps} chartLabel={chartLabel} windowLabel={t(`window.short.${timeWindow}`)} />}
                </Panel>
                {shown!.charts.length > 0 && (
                  <section aria-labelledby="watched-charts" className="space-y-3">
                    <h2 id="watched-charts" className="text-[15px] font-semibold text-ink">{t('watchlist.chartsTitle')}</h2>
                    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {shown!.charts.map((c) => <ChartCard key={c.watchId} card={c} label={chartLabel(c.chart.key)} />)}
                    </ul>
                  </section>
                )}
              </>
            )}
    </div>
  );
}

/** "🇵🇭 Philippines · Casino · Top Free" */
function useChartLabel(charts: Chart[]) {
  const f = useFormat();
  return (key: string) => {
    const ref = parseChartKey(key);
    if (!ref) return key;
    const name = charts.find((c) => c.key === key)?.genreName ?? String(ref.genreId);
    return `${flag(ref.country)} ${f.country(ref.country)} · ${f.genre(ref.genreId, name)} · ${f.chartType(ref.type)}`;
  };
}

function EmptyWatchlist({ chartKey }: { chartKey: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-felt-soft text-felt">
        <Star aria-hidden className="size-5" />
      </span>
      <h2 className="text-[16px] font-semibold text-ink">{t('watchlist.empty.title')}</h2>
      <p className="max-w-md text-[13.5px] text-ink-2">{t('watchlist.empty.body')}</p>
      <Link to={chartKey ? chartPath(chartKey) : '/'}
        className="rounded-lg border border-felt bg-felt px-4 py-1.5 text-[13px] font-medium text-surface hover:opacity-90">
        {t('watchlist.empty.cta')}
      </Link>
    </div>
  );
}

function AppLines({ lines, chartLabel, windowLabel }: { lines: WatchedApp[]; chartLabel: (key: string) => string; windowLabel: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const th = 'px-3 py-2 text-start text-[12px] font-medium text-ink-3';
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <caption className="sr-only">{t('watchlist.appsTitle')}</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={cn(th, 'w-16 ps-5 text-end')}>{t('watchlist.colRank')}</th>
            <th scope="col" className={cn(th, 'w-16')}>{windowLabel}</th>
            <th scope="col" className={th}>{t('watchlist.colApp')}</th>
            <th scope="col" className={cn(th, 'hidden w-28 md:table-cell')}>{t('watchlist.colTrend')}</th>
            <th scope="col" className={cn(th, 'hidden lg:table-cell')}>{t('watchlist.colLastEvent')}</th>
            <th scope="col" className={cn(th, 'w-32')}>{t('watchlist.colRule')}</th>
            <th scope="col" className={cn(th, 'w-10 pe-5')}><span className="sr-only">{t('watchlist.unfollow')}</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const target = lineTarget(l);
            return (
              <tr key={`${l.watchId}:${l.chart ?? '-'}`} className="border-b border-line/70 last:border-0 hover:bg-surface-2">
                <td className="pe-3 ps-5 text-end align-middle">
                  {l.currentRank != null
                    ? <span className="tnum text-[16px] font-semibold text-ink">{f.rank(l.currentRank)}</span>
                    : <span className="text-[12px] text-ink-3">{t('watchlist.notRanked')}</span>}
                </td>
                <td className="px-3 align-middle">
                  {l.windowStatus === 'NO_DATA' ? <span className="text-[12px] text-ink-3">{t('state.notEnoughHistory')}</span>
                    : l.windowStatus === 'OUT' ? <span className="text-ink-3">—</span>
                      : <RankDelta change={l.windowChange} isNew={l.windowStatus === 'NEW'} />}
                </td>
                <td className="px-3 py-2 align-middle">
                  <AppLabel app={l.app} chartKey={l.chart ?? undefined} size={36} showDeveloper={false} />
                  <p className="mt-0.5 ps-12 text-[12px] text-ink-3">{l.chart ? chartLabel(l.chart) : t('watchlist.rankedNowhere')}</p>
                </td>
                <td className="hidden px-3 align-middle md:table-cell"><Sparkline points={l.trend} /></td>
                <td className="hidden px-3 align-middle text-[12.5px] lg:table-cell">
                  {l.lastEvent ? <EventLine event={l.lastEvent} showApp={false} /> : <span className="text-ink-3">{t('watchlist.noEvent')}</span>}
                </td>
                <td className="px-3 align-middle">
                  <span className="inline-flex rounded border border-line px-1.5 py-0.5 text-[12px] text-ink-2">
                    {t(`watchlist.preset.${l.rule.preset}`)}
                  </span>
                  {l.allCharts && <span className="mt-0.5 block text-[11.5px] text-ink-3">{t('watchlist.scopeAll')}</span>}
                </td>
                <td className="pe-4 align-middle">
                  {target && <FollowButton target={target} name={l.app?.name} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** An event sentence and when it happened. */
function EventLine({ event, showApp }: { event: EventRow; showApp: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { key, values } = eventMessage(event);
  return (
    <span className="block">
      <span className="text-ink">{t(key, { ...values, app: showApp ? values.app : t('events.thisApp') })}</span>
      <time dateTime={event.at} title={f.dateTime(event.at)} className="block text-[12px] text-ink-3">{f.relative(event.at)}</time>
    </span>
  );
}

function ChartCard({ card, label }: { card: WatchedChart; label: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={chartPath(card.chart.key)} className="text-[14px] font-semibold text-ink hover:text-felt hover:underline">{label}</Link>
        <FollowButton target={{ kind: 'CHART', chartKey: card.chart.key }} className="-me-1.5 -mt-1" />
      </div>
      <div>
        <p className="text-[12px] text-ink-3">{t('watchlist.numberOne')}</p>
        {card.numberOne ? (
          <div className="mt-1 flex items-center gap-2">
            <AppLabel app={card.numberOne.app} chartKey={card.chart.key} size={32} className="flex-1" />
            {card.numberOne.since && <span className="shrink-0 text-[12px] text-ink-3">{t('watchlist.since', { when: f.relative(card.numberOne.since) })}</span>}
          </div>
        ) : <p className="mt-1 text-[13px] text-ink-3">{t('state.noData')}</p>}
      </div>
      <div className="border-t border-line pt-3 text-[13px]">
        <p className="text-[12px] text-ink-3">{t('watchlist.lastKeyMove')}</p>
        <div className="mt-1">
          {card.lastKeyMove ? <EventLine event={card.lastKeyMove} showApp /> : <span className="text-ink-3">{t('watchlist.noKeyMove')}</span>}
        </div>
      </div>
    </li>
  );
}
