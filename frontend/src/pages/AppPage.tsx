import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ExternalLink, Star } from 'lucide-react';
import type { AppResponse, Chart, ChartPerformance, CountryListing, EventRow, VersionsResponse } from '@/api/types';
import { chartPath, parseChartKey } from '@/domain/charts';
import { KEY_CHANGE_TYPES, summarize } from '@/domain/history';
import { DISPLAY_DEPTH, tierOf } from '@/domain/rank';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { RankHistoryChart, type VersionMark } from '@/components/charts/RankHistoryChart';
import { EventList } from '@/components/app/EventList';
import { Freshness } from '@/components/app/Freshness';
import { AppIcon } from '@/components/ui/AppIcon';
import { RisingTag } from '@/components/ui/Badges';
import { Panel } from '@/components/ui/Panel';
import { RankDelta } from '@/components/ui/RankDelta';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';

const RANGES = ['24h', '7d', '30d', '3m', '1y', 'all'] as const;
type Range = (typeof RANGES)[number];
const NO_PARAMS = {} as Record<string, never>;

export function AppPage() {
  const { t } = useTranslation();
  const { appleAppId = '' } = useParams();
  const app = useResource('app', { appleAppId });
  if (app.isLoading) return <AppPageSkeleton />;
  if (app.error && !app.data) {
    return app.error.status === 404
      ? <EmptyState>{t('app.notFound')}</EmptyState>
      : <ErrorState error={app.error} onRetry={app.reload} />;
  }
  return <AppDetails app={app.data!} />;
}

function AppDetails({ app }: { app: AppResponse }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const charts = useResource('charts', NO_PARAMS);

  // The chart in view: ?chart=… if the app is in it, otherwise its best current chart.
  const perf = app.charts.find((c) => c.chart === params.get('chart')) ?? app.charts[0];
  const range: Range = (RANGES as readonly string[]).includes(params.get('range') ?? '') ? (params.get('range') as Range) : '7d';
  const chart = charts.data?.find((c) => c.key === perf?.chart);
  const ref = perf ? parseChartKey(perf.chart) : null;
  const listing = app.listings.find((l) => l.country === ref?.country) ?? app.listings[0];
  const name = listing?.name ?? app.appleAppId;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const events = useResource('appEvents', { appleAppId: app.appleAppId, range: '1y', minImportance: 2 });
  const versions = useResource('appVersions', { appleAppId: app.appleAppId });
  const chartEvents = useMemo(() => (events.data ?? []).filter((e) => e.chart === perf?.chart), [events.data, perf?.chart]);

  return (
    <div className="space-y-6">
      {perf && (
        <Link to={chartPath(perf.chart)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-felt">
          <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />{t('app.backToRanking')}
        </Link>
      )}

      <IdentityHeader app={app} listing={listing} name={name} perf={perf} chart={chart} />

      {app.charts.length > 1 && (
        <nav aria-label={t('app.chartsOfApp')} className="flex flex-wrap gap-2">
          {app.charts.map((c) => <ChartChip key={c.chart} perf={c} charts={charts.data ?? []} selected={c.chart === perf?.chart}
            onSelect={() => setParam('chart', c.chart)} />)}
        </nav>
      )}

      {perf ? (
        <section aria-labelledby="ranking-heading"
          className="grid overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-[17rem_minmax(0,1fr)]">
          <RankHero perf={perf} />
          <HistoryPanel appleAppId={app.appleAppId} perf={perf} range={range} onRange={(r) => setParam('range', r)}
            events={chartEvents} versions={versions.data} country={ref?.country} />
        </section>
      ) : <EmptyState>{t('app.notTracked')}</EmptyState>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title={t('app.keyChanges')} description={t('app.keyChangesHint')}>
          {events.isLoading ? <SkeletonRows rows={5} />
            : <EventList events={chartEvents.filter((e) => KEY_CHANGE_TYPES.has(e.type)).slice(0, 10)} showApp={false} compact
              empty={perf && !reachedTop(perf) ? t('app.noKeyChangesBelowTop', { n: DISPLAY_DEPTH, best: f.rank(perf.bestRank) }) : t('app.noKeyChanges')} />}
        </Panel>
        {perf && <PerformancePanel perf={perf} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RatingsPanel appleAppId={app.appleAppId} listing={listing} />
        <VersionsPanel data={versions.data} country={ref?.country} loading={versions.isLoading} />
      </div>

      {listing && <AboutPanel app={app} listing={listing} />}
    </div>
  );
}

// --------------------------------------------------------------- identity

function IdentityHeader({ app, listing, name, perf, chart }: {
  app: AppResponse; listing: CountryListing | undefined; name: string; perf: ChartPerformance | undefined; chart: Chart | undefined;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const ref = perf ? parseChartKey(perf.chart) : null;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <AppIcon name={name} url={listing?.iconUrl} seed={app.appleAppId} size={76} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">{name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-2">
              <span>{listing?.developer ?? app.developer}</span>
              {listing?.rating != null && (
                <span className="inline-flex items-center gap-1 tnum">
                  <Star aria-hidden className="size-3.5 fill-current text-ink-3" />
                  {f.decimal1(listing.rating)}
                  <span className="text-ink-3">{t('app.ratingsCount', { count: listing.ratingCount ?? 0, value: f.compact(listing.ratingCount) })}</span>
                </span>
              )}
              {listing?.version && <span>{t('app.version', { version: listing.version })}</span>}
              {listing?.ageRating && <span className="rounded border border-line px-1.5 text-[12px]">{listing.ageRating}</span>}
            </p>
          </div>
          {listing?.storeUrl && (
            <a href={listing.storeUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-line-strong">
              {t('app.openInStore')}<ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
        {ref && (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-3">{t('context.country')}</dt>
              <dd className="font-medium text-ink"><span aria-hidden>{flag(ref.country)}</span> {f.country(ref.country)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-3">{t('context.category')}</dt>
              <dd className="font-medium text-ink">{f.genre(ref.genreId, chart?.genreName ?? String(ref.genreId))}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-3">{t('context.chart')}</dt>
              <dd className="font-medium text-ink">{f.chartType(ref.type)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-3">{t('app.trackedSince')}</dt>
              <dd className="font-medium text-ink">{f.date(perf?.firstObservedAt)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{t('app.lastUpdate')}</dt>
              <dd><Freshness asOf={perf?.asOf} delayed={chart?.delayed} /></dd>
            </div>
          </dl>
        )}
      </div>
    </header>
  );
}

function ChartChip({ perf, charts, selected, onSelect }: { perf: ChartPerformance; charts: Chart[]; selected: boolean; onSelect: () => void }) {
  const f = useFormat();
  const ref = parseChartKey(perf.chart);
  const chart = charts.find((c) => c.key === perf.chart);
  if (!ref) return null;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected}
      className={cn('inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]',
        selected ? 'border-felt bg-felt-soft text-felt' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}>
      <span aria-hidden>{flag(ref.country)}</span>
      <span>{f.genre(ref.genreId, chart?.genreName ?? '')} · {f.chartType(ref.type)}</span>
      <span className="tnum font-semibold">{f.rank(perf.currentRank)}</span>
    </button>
  );
}

// ------------------------------------------------------------- rank + graph

function RankHero({ perf }: { perf: ChartPerformance }) {
  const { t } = useTranslation();
  const f = useFormat();
  const tier = tierOf(perf.currentRank);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-8 gap-y-5 border-b border-line bg-surface-2 p-5 sm:p-6 lg:flex lg:flex-col lg:border-b-0 lg:border-e">
      <div>
        <h2 id="ranking-heading" className="text-[13px] text-ink-3">{t('app.currentRank')}</h2>
        {perf.currentRank != null ? (
          <p dir="ltr" className="mt-1 flex items-baseline gap-1 text-ink rtl:justify-end">
            <span className="text-[28px] font-light text-ink-3 sm:text-[34px]">#</span>
            <span className="tnum text-[64px] font-semibold leading-[0.9] tracking-tight sm:text-[84px]">{f.number(perf.currentRank)}</span>
          </p>
        ) : (
          <p className="mt-2 text-[17px] font-medium text-ink">{t('app.notRankedNow')}</p>
        )}
        <p className="mt-2 text-[13px] text-ink-2">
          {perf.currentRank == null
            ? t('app.lastSeenRanked', { when: f.relative(perf.asOf) })
            : tier && tier <= 10
              ? t(tier === 1 ? 'app.atNumberOne' : 'app.inTopN', { n: tier })
              : perf.inChartSince ? t('app.inChartSince', { when: f.relative(perf.inChartSince) }) : t('app.belowTop25')}
        </p>
        {perf.rising && <RisingTag className="mt-2" />}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <div>
          <dt className="text-ink-3">{t('app.change24h')}</dt>
          <dd className="mt-0.5"><RankDelta change={perf.change24h} size="lg" /></dd>
        </div>
        <div>
          <dt className="text-ink-3">{t('app.change7d')}</dt>
          <dd className="mt-0.5"><RankDelta change={perf.change7d} size="lg" /></dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ink-3">{t('app.bestRank')}</dt>
          <dd className="mt-0.5 text-ink">
            <span className="tnum text-[15px] font-semibold">{f.rank(perf.bestRank)}</span>
            {perf.bestRankAt && <span className="text-ink-3"> · {f.date(perf.bestRankAt)}</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function HistoryPanel({ appleAppId, perf, range, onRange, events, versions, country }: {
  appleAppId: string; perf: ChartPerformance; range: Range; onRange: (r: Range) => void;
  events: EventRow[]; versions: VersionsResponse | undefined; country: string | undefined;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const history = useResource('appHistory', { appleAppId, chartKey: perf.chart, range });
  const points = history.data?.points ?? [];
  const summary = summarize(points);

  const versionMarks: VersionMark[] = useMemo(() => {
    const seen = new Set<string>();
    return (versions?.details ?? [])
      .filter((d) => d.country === country && d.version && d.versionReleasedAt)
      .filter((d) => (seen.has(d.version!) ? false : (seen.add(d.version!), true)))
      .map((d) => ({ t: Date.parse(d.versionReleasedAt!), version: d.version! }));
  }, [versions, country]);

  const sentence = !summary ? null
    : summary.change > 0 ? t('history.climbed', { from: f.rank(summary.first.rank), to: f.rank(summary.last.rank), period: t(`range.${range}`) })
      : summary.change < 0 ? t('history.fell', { from: f.rank(summary.first.rank), to: f.rank(summary.last.rank), period: t(`range.${range}`) })
        : t('history.steady', { rank: f.rank(summary.last.rank), period: t(`range.${range}`) });

  return (
    <div className="min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{t('history.title')}</h2>
          {sentence && (
            <p className="mt-1 text-[14px] text-ink-2">
              {sentence}{' '}
              {summary && <span className="text-ink-3">{t('history.best', { rank: f.rank(summary.best.rank), when: f.dayMonth(summary.best.t) })}</span>}
            </p>
          )}
        </div>
        <SegmentedControl size="sm" label={t('history.range')} value={range} onChange={onRange}
          options={RANGES.map((r) => ({ value: r, label: t(`range.short.${r}`) }))} />
      </div>
      <div className="mt-4">
        {history.isLoading ? <Skeleton className="h-[300px]" />
          : history.error && !history.data ? <ErrorState error={history.error} onRetry={history.reload} />
            : points.length < 2 ? <EmptyState className="py-16">{t('history.notEnough')}</EmptyState>
              : (
                <figure>
                  <RankHistoryChart points={points} stepMinutes={history.data!.stepMinutes} events={events} versions={versionMarks} />
                  <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-full bg-up" />{t('history.legendUp')}</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-full bg-down" />{t('history.legendDown')}</span>
                    {versionMarks.length > 0 && (
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 border-s border-dashed border-felt" />{t('history.legendRelease')}</span>
                    )}
                    <span>{t('history.legendGaps')}</span>
                  </figcaption>
                  <details className="mt-3 text-[12.5px]">
                    <summary className="cursor-pointer text-ink-2 hover:text-ink">{t('history.showTable')}</summary>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
                      <table className="w-full text-start">
                        <thead className="sticky top-0 bg-surface-2">
                          <tr><th scope="col" className="px-3 py-1.5 text-start font-medium text-ink-3">{t('history.colTime')}</th>
                            <th scope="col" className="px-3 py-1.5 text-start font-medium text-ink-3">{t('history.colRank')}</th></tr>
                        </thead>
                        <tbody>
                          {[...points].reverse().map((p) => (
                            <tr key={p.t} className="border-t border-line"><td className="px-3 py-1 text-ink-2">{f.dateTime(p.t)}</td>
                              <td className="tnum px-3 py-1 text-ink">{f.rank(p.rank)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </figure>
              )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ side panels

/** Events and tier time only exist once an app has been within the display depth. */
function reachedTop(perf: ChartPerformance): boolean {
  return perf.bestRank != null && perf.bestRank <= DISPLAY_DEPTH;
}

function PerformancePanel({ perf }: { perf: ChartPerformance }) {
  const { t } = useTranslation();
  const f = useFormat();
  const tiers = [['number_one', t('app.tierNumberOne')], ['top_5', t('chart.topN', { n: 5 })],
    ['top_10', t('chart.topN', { n: 10 })], ['top_25', t('chart.topN', { n: 25 })]] as const;
  const maxHours = Math.max(1, ...Object.values(perf.hoursInTier));
  return (
    <Panel title={t('app.performance')} description={t('app.performanceHint')}>
      {!reachedTop(perf) ? (
        <p className="text-[13px] text-ink-2">{t('app.performanceBelowTop', { n: DISPLAY_DEPTH, best: f.rank(perf.bestRank) })}</p>
      ) : (
        <dl className="space-y-2.5">
          {tiers.map(([key, label]) => {
            const hours = perf.hoursInTier[key] ?? 0;
            return (
              <div key={key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-[13px]">
                <dt className="text-ink-2">{label}</dt>
                <dd className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-series" style={{ width: `${(hours / maxHours) * 100}%` }} />
                </dd>
                <dd className="tnum text-end text-ink">{hours > 0 ? f.hours(hours) : '—'}</dd>
              </div>
            );
          })}
        </dl>
      )}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px]">
        <div><dt className="text-ink-3">{t('app.average30d')}</dt><dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{perf.averageRank30d != null ? `#${f.decimal1(perf.averageRank30d)}` : '—'}</dd></div>
        <div><dt className="text-ink-3">{t('app.worstRank')}</dt><dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{perf.droppedOut ? t('app.worstOutOfChart') : f.rank(perf.worstRank)}</dd></div>
        <div><dt className="text-ink-3">{t('app.firstSeen')}</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{f.dayMonth(perf.firstObservedAt)}</dd></div>
      </dl>
    </Panel>
  );
}

function RatingsPanel({ appleAppId, listing }: { appleAppId: string; listing: CountryListing | undefined }) {
  const { t } = useTranslation();
  const f = useFormat();
  const ratings = useResource('appRatings', { appleAppId, range: '90d' });
  const series = (ratings.data ?? []).filter((r) => r.country === listing?.country && r.ratingCount != null);
  const first = series[0];
  const last = series[series.length - 1];
  const gained = first && last ? (last.ratingCount ?? 0) - (first.ratingCount ?? 0) : null;
  return (
    <Panel title={t('app.ratings')}>
      {ratings.isLoading ? <SkeletonRows rows={2} /> : !last ? <EmptyState>{t('app.noRatings')}</EmptyState> : (
        <dl className="grid grid-cols-3 gap-3 text-[13px]">
          <div><dt className="text-ink-3">{t('app.ratingAverage')}</dt>
            <dd className="mt-0.5 inline-flex items-center gap-1 text-[20px] font-semibold text-ink tnum"><Star aria-hidden className="size-4 fill-current text-ink-3" />{f.decimal1(last.rating)}</dd></div>
          <div><dt className="text-ink-3">{t('app.ratingCount')}</dt><dd className="tnum mt-0.5 text-[20px] font-semibold text-ink">{f.compact(last.ratingCount)}</dd></div>
          <div><dt className="text-ink-3">{t('app.ratingGained', { days: series.length })}</dt>
            <dd className="tnum mt-0.5 text-[20px] font-semibold text-ink">{gained != null ? `+${f.number(gained)}` : '—'}</dd></div>
        </dl>
      )}
    </Panel>
  );
}

function VersionsPanel({ data, country, loading }: { data: VersionsResponse | undefined; country: string | undefined; loading: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const versions = (data?.details ?? []).filter((d) => d.country === country && d.version)
    .filter((d, i, all) => all.findIndex((x) => x.version === d.version) === i);
  return (
    <Panel title={t('app.versions')}>
      {loading ? <SkeletonRows rows={3} /> : versions.length === 0 ? <EmptyState>{t('app.noVersions')}</EmptyState> : (
        <ol className="space-y-3">
          {versions.slice(0, 5).map((v) => (
            <li key={v.version} className="border-s-2 border-line ps-3">
              <p className="text-[13.5px] font-semibold text-ink">{t('app.version', { version: v.version })}
                <span className="ms-2 font-normal text-ink-3">{f.date(v.versionReleasedAt)}</span></p>
              {v.releaseNotes && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{v.releaseNotes}</p>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function AboutPanel({ app, listing }: { app: AppResponse; listing: CountryListing }) {
  const { t } = useTranslation();
  const f = useFormat();
  const facts = [
    [t('app.released'), f.date(app.releaseDate)],
    [t('app.size'), f.bytes(listing.sizeBytes)],
    [t('app.languages'), listing.languages ?? '—'],
    [t('app.price'), listing.price === 0 ? t('app.free') : listing.price != null ? `${f.number(listing.price)} ${listing.currency ?? ''}` : '—'],
    [t('app.bundleId'), app.bundleId ?? '—'],
    [t('app.appleId'), app.appleAppId],
  ];
  return (
    <Panel title={t('app.about')}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <p className="max-w-[70ch] whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{listing.description ?? t('app.noDescription')}</p>
        <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-3 text-[13px]">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0"><dt className="text-ink-3">{label}</dt><dd className="mt-0.5 truncate text-ink" dir="auto">{value}</dd></div>
          ))}
        </dl>
      </div>
      {listing.screenshotUrls.length > 0 && (
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
          {listing.screenshotUrls.slice(0, 8).map((src) => (
            <img key={src} src={src} alt="" loading="lazy" className="h-72 w-auto shrink-0 rounded-lg border border-line" />
          ))}
        </div>
      )}
    </Panel>
  );
}

function AppPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-4"><Skeleton className="size-[76px] rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-7 w-72" /><Skeleton className="h-4 w-96" /></div></div>
      <Skeleton className="h-[380px] rounded-xl" />
      <SkeletonRows rows={4} />
    </div>
  );
}
