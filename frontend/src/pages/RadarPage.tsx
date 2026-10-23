import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Radar } from 'lucide-react';
import type { Chart } from '@/api/types';
import type { RadarAbroad, RadarParams, RadarResponse } from '@/api/radarTypes';
import { parseChartKey } from '@/domain/charts';
import {
  DEFAULT_MIN_SCORE, DEFAULT_RADAR_WINDOW, GOOD_HISTORY_DAYS, historyDays, notEnoughHistory, RADAR_WINDOWS, radarCountries,
  radarGenres, sortRadarApps, type RadarWindow,
} from '@/domain/radar';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { AppLabel } from '@/components/app/AppLabel';
import { FollowButton } from '@/components/app/FollowButton';
import { ClusterCard } from '@/components/radar/ClusterCard';
import { DismissButton } from '@/components/radar/DismissButton';
import { RadarAppRow } from '@/components/radar/RadarAppRow';
import { ThemeEditor } from '@/components/radar/ThemeEditor';
import { WordRow } from '@/components/radar/WordRow';
import { Notice } from '@/components/ui/Notice';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/components/ui/cn';

const NO_PARAMS = {} as Record<string, never>;
type Tab = 'radar' | 'themes';

/**
 * The Radar: things that don't fit yet, spotted in the data the tracker already
 * has (new apps that climb, new words, look-alikes, what ranks abroad). Each app
 * says why it is here. A second tab manages the known themes.
 */
export function RadarPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const tab: Tab = search.get('tab') === 'themes' ? 'themes' : 'radar';
  const setTab = (next: Tab) => setSearch(next === 'themes' ? { tab: 'themes' } : {}, { replace: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('radar.title')}</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-ink-3">{t('radar.subtitle')}</p>
        </div>
        <div role="tablist" aria-label={t('radar.tabs')} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
          {(['radar', 'themes'] as const).map((id) => (
            <button key={id} type="button" role="tab" id={`radar-tab-${id}`} aria-selected={tab === id}
              aria-controls={`radar-panel-${id}`} onClick={() => setTab(id)}
              className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium',
                tab === id ? 'bg-surface text-felt shadow-[0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink')}>
              {t(`radar.tab.${id}`)}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={`radar-panel-${tab}`} aria-labelledby={`radar-tab-${tab}`}>
        {tab === 'radar' ? <RadarTab /> : <ThemesTab />}
      </div>
    </div>
  );
}

function ThemesTab() {
  const themes = useResource('radarThemes', NO_PARAMS);
  if (themes.data) return <ThemeEditor themes={themes.data} />;
  if (themes.error) return <ErrorState error={themes.error} onRetry={themes.reload} />;
  return <SkeletonRows rows={8} />;
}

function RadarTab() {
  const { t } = useTranslation();
  const charts = useResource('charts', NO_PARAMS);
  const countries = radarCountries(charts.data ?? []);
  const [countryChoice, setCountry] = useState<string | null>(null);
  const country = countryChoice ?? (countries.includes('ph') || countries.length === 0 ? 'ph' : countries[0]!);
  const genres = radarGenres(charts.data ?? [], country);
  const [genreChoice, setGenre] = useState('all');
  const genre = genres.some((g) => String(g.id) === genreChoice) ? genreChoice : 'all';
  const [period, setPeriod] = useState<RadarWindow>(DEFAULT_RADAR_WINDOW);
  const [hideKnown, setHideKnown] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const f = useFormat();
  const chartLabel = useChartLabel(charts.data ?? [], country);

  const params = useMemo<RadarParams>(() => ({
    country, ...(genre === 'all' ? {} : { genre: Number(genre) }), window: period, hideKnown, showDismissed,
    minScore: showAll ? 0 : DEFAULT_MIN_SCORE,
  }), [country, genre, period, hideKnown, showDismissed, showAll]);
  const radar = useResource('radar', params);
  const data = radar.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Select label={t('radar.country')} showLabel value={country} onChange={(c) => {
          setCountry(c);
          setGenre('all');
        }} className="w-48"
          options={(countries.length ? countries : [country]).map((c) => ({ value: c, label: `${flag(c)} ${f.country(c)}` }))} />
        <Select label={t('radar.scope')} showLabel value={genre} onChange={setGenre} className="w-52"
          options={[{ value: 'all', label: t('radar.allCategories') },
            ...genres.map((g) => ({ value: String(g.id), label: f.genre(g.id, g.name) }))]} />
        <div className="flex flex-col gap-1">
          <span aria-hidden className="text-[12px] text-ink-3">{t('window.label')}</span>
          <SegmentedControl label={t('window.label')} value={period} onChange={setPeriod}
            options={RADAR_WINDOWS.map((w) => ({ value: w, label: t(`radar.window.${w}`) }))} />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-[13px] text-ink-2">
          <Switch checked={hideKnown} onChange={setHideKnown} label={t('radar.hideKnown')} />
          <span aria-hidden>{t('radar.hideKnown')}</span>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-[13px] text-ink-2">
          <Switch checked={showDismissed} onChange={setShowDismissed} label={t('radar.showDismissed')} />
          <span aria-hidden>{t('radar.showDismissed')}</span>
        </label>
        {data?.asOf && <p className="ms-auto pb-2 text-[12.5px] text-ink-3">{t('radar.asOf', { when: f.relative(data.asOf) })}</p>}
      </div>

      {radar.isLoading ? <RadarSkeleton />
        : radar.error && !data ? <ErrorState error={radar.error} onRetry={radar.reload} />
          : data && (
            <RadarSections data={data} chartLabel={chartLabel} showAll={showAll} onShowAll={setShowAll} />
          )}
    </div>
  );
}

/** "Casino · Top Free" in the selected country; "🇺🇸 United States · Casino · Top Free" elsewhere. */
function useChartLabel(charts: Chart[], country: string) {
  const f = useFormat();
  return (key: string) => {
    const ref = parseChartKey(key);
    if (!ref) return key;
    const name = charts.find((c) => c.key === key)?.genreName ?? String(ref.genreId);
    const label = `${f.genre(ref.genreId, name)} · ${f.chartType(ref.type)}`;
    return ref.country === country ? label : `${flag(ref.country)} ${f.country(ref.country)} · ${label}`;
  };
}

function RadarSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-5 w-48" />
          <SkeletonRows rows={4} />
        </div>
      ))}
    </div>
  );
}

function RadarSections({ data, chartLabel, showAll, onShowAll }: {
  data: RadarResponse; chartLabel: (key: string) => string; showAll: boolean; onShowAll: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const days = historyDays(data.dataSince);
  const short = notEnoughHistory(data.dataSince);
  const tooShortHint = t('radar.empty.needsHistory', { days: GOOD_HISTORY_DAYS });

  if (data.notes.includes('NO_CHARTS')) {
    return (
      <EmptyCard title={t('radar.noCharts.title')} body={t('radar.noCharts.body')}
        action={<Link to="/settings/tracking" className="text-[13px] font-medium text-felt hover:underline">{t('radar.noCharts.cta')}</Link>} />
    );
  }

  return (
    <div className="space-y-6">
      {short && (
        <Notice tone="warning" title={t('radar.history.shortTitle')}>
          {t('radar.history.shortBody', { days: GOOD_HISTORY_DAYS, since: f.date(data.dataSince), count: days ?? 0 })}
        </Notice>
      )}
      {!short && data.notes.includes('BASELINE_SHORT') && (
        <Notice tone="info">{t('radar.history.baselineShort', { since: f.date(data.dataSince), count: days ?? 0 })}</Notice>
      )}
      {(data.hiddenByScore > 0 || showAll) && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
          {showAll ? <span>{t('radar.showingAll')}</span>
            : <span>{t('radar.hiddenByScore', { count: data.hiddenByScore, score: DEFAULT_MIN_SCORE })}</span>}
          <button type="button" onClick={() => onShowAll(!showAll)} className="font-medium text-felt hover:underline">
            {showAll ? t('radar.hideLowScores') : t('radar.showAll')}
          </button>
        </div>
      )}

      <Panel title={t('radar.newcomers.title')} description={t('radar.newcomers.hint')} bodyClassName="px-0 pb-1">
        {data.newcomers.length === 0
          ? <div className="px-5 pb-4"><EmptyState>{short ? tooShortHint : t('radar.newcomers.empty')}</EmptyState></div>
          : (
            <ul className="divide-y divide-line/70">
              {sortRadarApps(data.newcomers).map((r) => (
                <RadarAppRow key={`${r.app?.appleAppId}:${r.chart}`} row={r} chartLabel={chartLabel} />
              ))}
            </ul>
          )}
      </Panel>

      <Panel title={t('radar.rising.title')} description={t('radar.rising.hint')} bodyClassName="px-0 pb-1">
        {data.risingFromBottom.length === 0
          ? <div className="px-5 pb-4"><EmptyState>{short ? tooShortHint : t('radar.rising.empty')}</EmptyState></div>
          : (
            <ul className="divide-y divide-line/70">
              {sortRadarApps(data.risingFromBottom).map((r) => (
                <RadarAppRow key={`${r.app?.appleAppId}:${r.chart}`} row={r} chartLabel={chartLabel} showStart />
              ))}
            </ul>
          )}
      </Panel>

      <Panel title={t('radar.words.title')} description={t('radar.words.hint')} bodyClassName="px-0 pb-1">
        {data.emergingWords.length === 0
          ? <div className="px-5 pb-4"><EmptyState>{short ? tooShortHint : t('radar.words.empty')}</EmptyState></div>
          : <ul className="divide-y divide-line/70">{data.emergingWords.map((w) => <WordRow key={w.word} word={w} />)}</ul>}
      </Panel>

      <section aria-labelledby="radar-clusters" className="space-y-3">
        <div>
          <h2 id="radar-clusters" className="text-[15px] font-semibold text-ink">{t('radar.clusters.title')}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{t('radar.clusters.hint')}</p>
        </div>
        {data.clusters.length === 0
          ? <EmptyState>{short ? tooShortHint : t('radar.clusters.empty')}</EmptyState>
          : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.clusters.map((c) => <ClusterCard key={c.originator?.appleAppId ?? c.originatorFirstSeenAt} cluster={c} chartLabel={chartLabel} />)}
            </ul>
          )}
      </section>

      <Panel title={t('radar.abroad.title')} description={t('radar.abroad.hint', { country: f.country(data.country) })} bodyClassName="px-0 pb-1">
        {data.notes.includes('ONLY_ONE_COUNTRY') ? (
          <div className="px-5 pb-4">
            <div className="rounded-lg bg-surface-2 px-4 py-5 text-[13px] text-ink-2">
              <p>{t('radar.abroad.oneCountry')}</p>
              <p className="mt-2">
                {t('radar.abroad.oneCountryScript')} <code dir="ltr" className="rounded bg-surface px-1 py-px text-[12px]">collector/db/activate-us.sql</code>
              </p>
              <Link to="/settings/countries" className="mt-3 inline-block font-medium text-felt hover:underline">{t('radar.abroad.oneCountryCta')}</Link>
            </div>
          </div>
        ) : data.abroad.length === 0 && data.abroadWords.length === 0
          ? <div className="px-5 pb-4"><EmptyState>{t('radar.abroad.empty')}</EmptyState></div>
          : (
            <>
              {data.abroad.length > 0 && (
                <ul className="divide-y divide-line/70">
                  {data.abroad.map((a) => <AbroadRow key={a.app?.appleAppId ?? a.ranks[0]?.chart} row={a} chartLabel={chartLabel} />)}
                </ul>
              )}
              {data.abroadWords.length > 0 && (
                <div className="border-t border-line">
                  <h3 className="px-5 pt-3 text-[13px] font-semibold text-ink">{t('radar.abroad.wordsTitle')}</h3>
                  <ul className="divide-y divide-line/70">{data.abroadWords.map((w) => <WordRow key={w.word} word={w} />)}</ul>
                </div>
              )}
            </>
          )}
      </Panel>
    </div>
  );
}

/** An app in another country's Top 25 that never ranked here: where, since when, and in how many countries. */
function AbroadRow({ row, chartLabel }: { row: RadarAbroad; chartLabel: (key: string) => string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const best = row.ranks[0];
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3', row.dismissed && 'opacity-60')}>
      <div className="min-w-0 flex-1 basis-56">
        <AppLabel app={row.app} chartKey={best?.chart} size={36} />
        <ul className="mt-1 space-y-0.5 ps-12 text-[12px] text-ink-3">
          {row.ranks.map((r) => (
            <li key={r.chart}>
              <span className="tnum font-semibold text-ink">{f.rank(r.rank)}</span> {chartLabel(r.chart)}
              {' · '}{r.since ? t('radar.abroad.since', { when: f.relative(r.since) }) : t('radar.abroad.sinceStart')}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[12px] text-ink-3" title={f.list(row.countries.map((c) => f.country(c)))}>
        {row.countries.map((c) => flag(c)).join(' ')} · {t('radar.countries', { count: row.countries.length })}
      </p>
      {row.app && (
        <div className="flex shrink-0 items-center">
          <FollowButton target={{ kind: 'APP', appleAppId: row.app.appleAppId }} name={row.app.name} />
          <DismissButton appleAppId={row.app.appleAppId} name={row.app.name} dismissed={row.dismissed} />
        </div>
      )}
    </li>
  );
}

function EmptyCard({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-felt-soft text-felt">
        <Radar aria-hidden className="size-5" />
      </span>
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-[13.5px] text-ink-2">{body}</p>
      {action}
    </div>
  );
}
