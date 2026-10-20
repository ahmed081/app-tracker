import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Crown } from 'lucide-react';
import type { Chart, HeadlinesResponse, Mover } from '@/api/types';
import { useAppSelector } from '@/app/hooks';
import { chartPath } from '@/domain/charts';
import { useChartSelection } from '@/features/charts/useChartSelection';
import { useResource } from '@/features/remote/useResource';
import { useFormat } from '@/i18n/format';
import { ChartToolbar } from '@/components/layout/ChartToolbar';
import { AppLabel } from '@/components/app/AppLabel';
import { EventList } from '@/components/app/EventList';
import { Panel } from '@/components/ui/Panel';
import { RankDelta } from '@/components/ui/RankDelta';
import { RankTransition } from '@/components/ui/RankTransition';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { MoverList } from '@/components/app/MoverList';

export function OverviewPage() {
  const { t } = useTranslation();
  const selection = useChartSelection();

  if (selection.error && !selection.charts.length) return <ErrorState error={selection.error} onRetry={selection.reload} />;
  if (selection.isLoading || !selection.chart) {
    return selection.isLoading ? <SkeletonRows rows={8} /> : <EmptyState>{t('charts.none')}</EmptyState>;
  }
  return <Overview chart={selection.chart} charts={selection.charts} />;
}

function Overview({ chart, charts }: { chart: Chart; charts: Chart[] }) {
  const { t } = useTranslation();
  const { window, previousVisitAt } = useAppSelector((s) => s.preferences);
  const headlines = useResource('headlines', { chartKey: chart.key, window });
  const events = useResource('chartEvents', { chartKey: chart.key, minImportance: 2, limit: 24 });
  const movers = useResource('movers', { chartKey: chart.key, window, minPlaces: 3 });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('overview.title')}</h1>
        </div>
        <ChartToolbar charts={charts} chart={chart} />
      </div>

      {previousVisitAt && <SinceLastVisit chart={chart} since={previousVisitAt} />}

      {headlines.error && !headlines.data ? <ErrorState error={headlines.error} onRetry={headlines.reload} />
        : <HeadlineStrip data={headlines.data} chart={chart} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title={t('overview.latestEvents')}
          action={<Link to={`${chartPath(chart.key)}/movers`} className="text-[13px] font-medium text-felt hover:underline">{t('overview.allMovers')}</Link>}>
          {events.isLoading ? <SkeletonRows rows={6} />
            : events.error && !events.data ? <ErrorState error={events.error} onRetry={events.reload} />
              : <EventList events={(events.data?.events ?? []).filter((e) => !e.type.startsWith('RISING_')).slice(0, 10)} />}
        </Panel>
        <Panel title={t('overview.rising')} description={t('overview.risingHint')}>
          {movers.isLoading ? <SkeletonRows rows={4} />
            : <MoverList movers={movers.data?.rising ?? []} chartKey={chart.key} empty={t('overview.noRising')} showFrom={false} />}
        </Panel>
      </div>
    </div>
  );
}

function SinceLastVisit({ chart, since }: { chart: Chart; since: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const events = useResource('chartEvents', { chartKey: chart.key, minImportance: 3, since, limit: 50 });
  const list = events.data?.events ?? [];
  if (events.isLoading || list.length === 0) return null;
  const numberOne = list.filter((e) => e.type === 'REACHED_NUMBER_ONE').length;
  const top10 = list.filter((e) => e.type === 'ENTERED_TOP_N' && e.tier === 10).length;
  return (
    <section aria-label={t('overview.sinceVisit', { when: f.relative(since) })}
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-felt/25 bg-felt-soft px-5 py-3 text-[13.5px] text-ink">
      <p className="font-semibold text-felt">{t('overview.sinceVisit', { when: f.relative(since) })}</p>
      <p>{t('overview.sinceVisitSummary', { count: list.length })}</p>
      {numberOne > 0 && <p>{t('overview.sinceVisitNumberOne', { count: numberOne })}</p>}
      {top10 > 0 && <p>{t('overview.sinceVisitTop10', { count: top10 })}</p>}
    </section>
  );
}

/** The answer to "what changed?" in one band: #1, climber, drop, top 10 entries, new entries. */
function HeadlineStrip({ data, chart }: { data: HeadlinesResponse | undefined; chart: Chart }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!data) return <Skeleton className="h-36 rounded-xl" />;
  const cell = 'min-w-0 px-5 py-4';
  return (
    <section aria-label={t('overview.headlines')}
      className="grid divide-y divide-line rounded-xl border border-line bg-surface sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x rtl:lg:divide-x-reverse">
      <div className={cell}>
        <h3 className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Crown aria-hidden className="size-3.5 text-felt" />{t('overview.numberOne')}</h3>
        {data.numberOne ? (
          <>
            <AppLabel app={data.numberOne.app} chartKey={chart.key} size={40} className="mt-2.5" />
            <p className="mt-2 text-[12.5px] text-ink-2">
              {data.numberOne.since ? t('overview.numberOneSince', { when: f.relative(data.numberOne.since) }) : t('overview.numberOneLong')}
            </p>
          </>
        ) : <p className="mt-2 text-[13px] text-ink-3">{t('state.noData')}</p>}
      </div>
      <HeadlineMover title={t('overview.biggestClimber')} mover={data.biggestClimber} chartKey={chart.key} empty={t('overview.noClimber')} />
      <HeadlineMover title={t('overview.biggestDrop')} mover={data.biggestDrop} chartKey={chart.key} empty={t('overview.noDrop')} />
      <div className={cell}>
        <h3 className="text-[12.5px] text-ink-3">{t('overview.top10Entries')}</h3>
        {data.enteredTop10.length === 0 && data.newEntries.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-2">{data.quiet ? t('overview.quiet') : t('overview.noTop10Entries')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {[...data.enteredTop10, ...data.newEntries].slice(0, 3).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                <Link to={`/apps/${e.app?.appleAppId}?chart=${encodeURIComponent(chart.key)}`} className="truncate text-ink hover:text-felt hover:underline">
                  {e.app?.name}
                </Link>
                <span className="tnum shrink-0 text-ink-2">{f.rank(e.currentRank)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function HeadlineMover({ title, mover, chartKey, empty }: { title: string; mover: Mover | null; chartKey: string; empty: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <h3 className="text-[12.5px] text-ink-3">{title}</h3>
      {mover ? (
        <>
          <AppLabel app={mover.app} chartKey={chartKey} size={40} className="mt-2.5" />
          <p className="mt-2 flex items-center gap-2 text-[13px]">
            <RankTransition from={mover.fromRank} to={mover.toRank} />
            <RankDelta change={mover.change} />
          </p>
        </>
      ) : <p className="mt-2 text-[13px] text-ink-3">{empty}</p>}
    </div>
  );
}
