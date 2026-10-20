import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Chart, MoversResponse } from '@/api/types';
import { useAppSelector } from '@/app/hooks';
import { useChartSelection } from '@/features/charts/useChartSelection';
import { useResource } from '@/features/remote/useResource';
import { ChartToolbar } from '@/components/layout/ChartToolbar';
import { EventList } from '@/components/app/EventList';
import { MoverList } from '@/components/app/MoverList';
import { PartialWindowNote } from '@/components/app/PartialWindowNote';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';

type Tab = 'climbers' | 'fallers' | 'newEntries' | 'leftChart' | 'rising' | 'tierCrossings';
const TABS: Tab[] = ['climbers', 'fallers', 'newEntries', 'leftChart', 'rising', 'tierCrossings'];
/** Which apps count: those in the Top 25, or every ranked app (the API caps both at 200). */
type Scope = 'all' | 'top25';
const DEPTH: Record<Scope, number> = { all: 200, top25: 25 };
/** Apps listed per tab. */
const LIST_LIMIT = 100;

export function MoversPage() {
  const { t } = useTranslation();
  const selection = useChartSelection();
  if (selection.isLoading) return <SkeletonRows rows={10} />;
  if (selection.error && !selection.charts.length) return <ErrorState error={selection.error} onRetry={selection.reload} />;
  if (!selection.chart) return <EmptyState>{t('charts.notFound')}</EmptyState>;
  return <Movers chart={selection.chart} charts={selection.charts} />;
}

function Movers({ chart, charts }: { chart: Chart; charts: Chart[] }) {
  const { t } = useTranslation();
  const { window: timeWindow, minPlaces } = useAppSelector((s) => s.preferences);
  const [tab, setTab] = useState<Tab>('climbers');
  const [scope, setScope] = useState<Scope>('all');
  const movers = useResource('movers', {
    chartKey: chart.key, window: timeWindow, minPlaces: Math.max(1, minPlaces || 3), depth: DEPTH[scope], limit: LIST_LIMIT,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('movers.title')}</h1>
        </div>
        <ChartToolbar charts={charts} chart={chart} />
      </div>
      <Panel
        title={t(`movers.tab.${tab}`)}
        description={t(`movers.hint.${tab}`, { window: t(`window.long.${timeWindow}`), scope: t(`movers.scope.in.${scope}`) })}
        action={(
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl size="sm" label={t('movers.scope.label')} value={scope} onChange={setScope}
              options={(['all', 'top25'] as const).map((x) => ({ value: x, label: t(`movers.scope.${x}`) }))} />
            <SegmentedControl size="sm" label={t('movers.title')} value={tab} onChange={setTab}
              options={TABS.map((x) => ({ value: x, label: t(`movers.tab.${x}`) }))} className="flex-wrap" />
          </div>
        )}
      >
        {movers.data && tab !== 'rising' && (
          <div className="mb-3"><PartialWindowNote asOf={movers.data.asOf} windowAt={movers.data.windowAt} window={timeWindow} /></div>
        )}
        {movers.isLoading ? <SkeletonRows rows={8} />
          : movers.error && !movers.data ? <ErrorState error={movers.error} onRetry={movers.reload} />
            : <MoversTab data={movers.data!} tab={tab} chartKey={chart.key} />}
      </Panel>
    </div>
  );
}

function MoversTab({ data, tab, chartKey }: { data: MoversResponse; tab: Tab; chartKey: string }) {
  const { t } = useTranslation();
  if (!data.windowAt && tab !== 'rising' && tab !== 'tierCrossings') return <EmptyState>{t('state.notEnoughHistory')}</EmptyState>;
  if (tab === 'tierCrossings') return <EventList events={data.tierCrossings} empty={t('movers.empty')} />;
  return <MoverList movers={data[tab]} chartKey={chartKey} showFrom={tab !== 'rising'} empty={t('movers.empty')} />;
}
