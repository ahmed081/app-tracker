import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CircleAlert, CircleCheck, CircleDashed, Clock, RefreshCw, TriangleAlert } from 'lucide-react';
import type { ChartStatus, StatusResponse } from '@/api/manageTypes';
import { chartPath } from '@/domain/charts';
import { collectorHealth, parseReasons, sortChartStatuses, type Health } from '@/domain/manage';
import { useMutation } from '@/features/manage/useMutation';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { Loaded, NO_PARAMS, SaveError, useIntervalLabel } from './shared';

/** How often the page re-reads the status: quickly while events are being recomputed. */
const POLL_MS = 30_000;
const POLL_REBUILD_MS = 3_000;

export function StatusPage() {
  const status = useResource('manageStatus', NO_PARAMS);
  const running = status.data?.rebuild.running ?? false;
  const { reload } = status;
  useEffect(() => {
    const timer = window.setInterval(reload, running ? POLL_REBUILD_MS : POLL_MS);
    return () => window.clearInterval(timer);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Loaded resource={status} rows={8}>{(data) => <Status data={data} />}</Loaded>;
}

const HEALTH_TONE: Record<Health, 'success' | 'info' | 'warning' | 'error'> = {
  ok: 'success', idle: 'info', waiting: 'info', warning: 'warning', delayed: 'warning', stopped: 'error',
};

function Status({ data }: { data: StatusResponse }) {
  const { t } = useTranslation();
  const f = useFormat();
  const health = collectorHealth(data);
  const charts = sortChartStatuses(data.charts);

  return (
    <div className="space-y-6">
      <Notice tone={HEALTH_TONE[health.level]} title={t(`manage.health.${health.level}`)}>
        {t('manage.health.summary', { active: health.active, delayed: health.delayed, failing: health.failing })}
      </Notice>
      {!data.adminKeyRequired && <Notice tone="warning">{t('manage.status.openWarning')}</Notice>}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Panel title={t('manage.status.collector')}>
          <dl className="space-y-1.5 text-[13px]">
            <Row label={t('manage.status.targetCharts')} value={f.number(data.collector.targetCharts)} />
            <Row label={t('manage.status.lastAttempt')} value={f.relative(data.collector.lastAttemptAt)} />
            <Row label={t('manage.status.lastValid')} value={f.relative(data.collector.lastValidReadingAt)} />
          </dl>
        </Panel>
        <EventsPanel data={data} />
        <MetadataPanel />
        <RebuildPanel data={data} />
      </div>

      <Panel title={t('manage.status.chartsTitle')} description={t('manage.status.chartsHint')} bodyClassName="px-0 pb-2">
        {charts.length === 0 ? <div className="px-5 pb-3"><EmptyState>{t('manage.status.noCharts')}</EmptyState></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">{t('manage.status.chartsTitle')}</caption>
              <thead>
                <tr className="border-b border-line text-start text-[12px] text-ink-3">
                  <th scope="col" className="px-5 py-2 text-start font-medium">{t('context.chart')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('manage.status.colStatus')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('manage.status.colLastReading')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('manage.status.colEntries')}</th>
                  <th scope="col" className="px-5 py-2 text-end font-medium">{t('manage.status.colPending')}</th>
                </tr>
              </thead>
              <tbody>{charts.map((c) => <ChartRow key={c.key} chart={c} />)}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tnum text-end text-ink">{value}</dd>
    </div>
  );
}

function EventsPanel({ data }: { data: StatusResponse }) {
  const { t } = useTranslation();
  const f = useFormat();
  const run = useMutation('processEvents');
  return (
    <Panel title={t('manage.status.events')}>
      <dl className="space-y-1.5 text-[13px]">
        <Row label={t('manage.status.pending')} value={f.number(data.events.pendingSnapshots)} />
        <Row label={t('manage.status.lastProcessed')} value={f.relative(data.events.lastProcessedAt)} />
      </dl>
      <Button size="sm" className="mt-3" busy={run.saving} icon={<RefreshCw aria-hidden className="size-3.5" />}
        onClick={() => run.run(NO_PARAMS)}>{t('manage.status.processNow')}</Button>
      {run.status === 'success' && run.data && (
        <p role="status" className="mt-2 text-[12.5px] text-ink-2">{t('manage.status.processed', { count: run.data.processedSnapshots })}</p>
      )}
      <SaveError error={run.error} />
    </Panel>
  );
}

function MetadataPanel() {
  const { t } = useTranslation();
  const run = useMutation('refreshMetadata');
  return (
    <Panel title={t('manage.status.metadata')} description={t('manage.status.metadataHint')}>
      <Button size="sm" busy={run.saving} icon={<RefreshCw aria-hidden className="size-3.5" />}
        onClick={() => run.run(NO_PARAMS)}>{t('manage.status.lookupNow')}</Button>
      {run.status === 'success' && run.data && (
        <p role="status" className="mt-2 text-[12.5px] text-ink-2">
          {t('manage.status.lookupDone', { apps: run.data.apps, found: run.data.found, failed: run.data.failedCalls })}
        </p>
      )}
      <SaveError error={run.error} />
    </Panel>
  );
}

function RebuildPanel({ data }: { data: StatusResponse }) {
  const { t } = useTranslation();
  const f = useFormat();
  const run = useMutation('rebuildEvents');
  const r = data.rebuild;
  const percent = r.chartsTotal > 0 ? Math.round((r.chartsDone / r.chartsTotal) * 100) : 0;
  return (
    <Panel title={t('manage.status.rebuild')} description={t('manage.status.rebuildHint')}>
      {r.running ? (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-2">{t('manage.status.rebuildProgress', { done: r.chartsDone, total: r.chartsTotal })}</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
            aria-label={t('manage.status.rebuild')} className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-felt transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : (
        <>
          <Button size="sm" busy={run.saving} onClick={() => run.run(NO_PARAMS)}>{t('manage.action.recompute')}</Button>
          {r.finishedAt && (
            <p className={cn('mt-2 text-[12.5px]', r.error ? 'text-down' : 'text-ink-2')}>
              {r.error
                ? t('manage.status.rebuildFailed', { when: f.relative(r.finishedAt), error: r.error })
                : t('manage.status.rebuildDone', { when: f.relative(r.finishedAt), count: r.snapshotsProcessed })}
            </p>
          )}
        </>
      )}
      <SaveError error={run.error} />
    </Panel>
  );
}

function ChartRow({ chart }: { chart: ChartStatus }) {
  const { t } = useTranslation();
  const f = useFormat();
  const intervalLabel = useIntervalLabel();
  const reasons = parseReasons(chart.lastReasons);
  return (
    <tr className={cn('border-b border-line last:border-0', !chart.active && 'text-ink-3')}>
      <th scope="row" className="px-5 py-2.5 text-start font-normal">
        <Link to={chartPath(chart.key)} className="font-medium text-ink hover:text-felt hover:underline">
          <span aria-hidden>{flag(chart.country)} </span>
          {f.country(chart.country)} · {f.genre(chart.genreId, chart.genreName)} · {f.chartType(chart.chartType)}
        </Link>
        <p className="text-[12px] text-ink-3">{chart.active ? intervalLabel(chart.intervalMinutes) : t('manage.status.inactive')}</p>
      </th>
      <td className="px-3 py-2.5 align-top">
        <StatusBadge chart={chart} />
        {reasons.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[12px] text-ink-3">
            {reasons.slice(0, 3).map((r, i) => <li key={i}>{t(`manage.reason.${r.code}`, { detail: r.detail })}</li>)}
          </ul>
        )}
      </td>
      <td className="px-3 py-2.5 align-top text-ink-2">
        {chart.lastSlot ? f.relative(chart.lastSlot) : '—'}
        {chart.delayed && (
          <p className="text-[12px] text-down">
            {chart.lastValidReadingAt ? t('manage.status.delayed', { when: f.relative(chart.lastValidReadingAt) }) : t('manage.status.neverValid')}
          </p>
        )}
      </td>
      <td className="tnum px-3 py-2.5 text-end align-top">{f.number(chart.lastEntryCount)}</td>
      <td className="tnum px-5 py-2.5 text-end align-top">{f.number(chart.pendingSnapshots)}</td>
    </tr>
  );
}

function StatusBadge({ chart }: { chart: ChartStatus }) {
  const { t } = useTranslation();
  const s = chart.lastStatus;
  const { Icon, className } = !s ? { Icon: CircleDashed, className: 'text-ink-3' }
    : s === 'VALID' ? (chart.delayed ? { Icon: Clock, className: 'text-warn' } : { Icon: CircleCheck, className: 'text-up' })
      : s === 'INCOMPLETE' ? { Icon: TriangleAlert, className: 'text-warn' }
        : { Icon: CircleAlert, className: 'text-down' };
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
      <Icon aria-hidden className={cn('size-4', className)} />
      {t(`manage.snapshot.${s ?? 'NONE'}`)}
    </span>
  );
}
