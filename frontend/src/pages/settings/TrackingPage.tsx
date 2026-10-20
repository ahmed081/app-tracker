import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { ChartType } from '@/api/types';
import type { ManagedCountry, ManagedGenre, Tracking } from '@/api/manageTypes';
import {
  CHART_TYPES, DEFAULT_DEPTH, DEFAULT_INTERVAL, INTERVAL_CHOICES, genreSwitchImpact, previewTracking, validateTracking,
  type Blocker, type FieldErrors, type TrackingDraft,
} from '@/domain/manage';
import { useMutation } from '@/features/manage/useMutation';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { Button } from '@/components/ui/Button';
import { Field, TextInput, ToggleChip } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Combobox } from '@/components/ui/Combobox';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { Loaded, NO_PARAMS, SaveError, useIntervalLabel } from './shared';

const GAMES = 6014;

export function TrackingPage() {
  const { t } = useTranslation();
  const countries = useResource('manageCountries', NO_PARAMS);
  const genres = useResource('manageGenres', NO_PARAMS);
  const tracking = useResource('manageTracking', NO_PARAMS);
  const countryList = countries.data ?? [];
  const genreList = genres.data ?? [];

  return (
    <div className="space-y-6">
      <Notice>{t('manage.tracking.appliesWithin')}</Notice>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title={t('manage.tracking.title')} description={t('manage.tracking.hint')}>
          <Loaded resource={tracking} rows={4}>
            {(list) => list.length === 0 ? <EmptyState>{t('manage.tracking.empty')}</EmptyState> : (
              <ul className="space-y-3">
                {list.map((row) => <TrackingCard key={row.id} tracking={row} countries={countryList} genres={genreList} />)}
              </ul>
            )}
          </Loaded>
        </Panel>
        <Panel title={t('manage.tracking.addTitle')} description={t('manage.tracking.addHint')} className="self-start">
          <Loaded resource={genres} rows={4}>
            {(list) => <AddTrackingForm countries={countryList} genres={list} trackings={tracking.data ?? []} />}
          </Loaded>
        </Panel>
      </div>
      <Panel title={t('manage.genres.title')} description={t('manage.genres.hint')}>
        <Loaded resource={genres} rows={6}>
          {(list) => <GenreList genres={list} countries={countryList} trackings={tracking.data ?? []} />}
        </Loaded>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------ tracked rows

function TrackingCard({ tracking, countries, genres }: { tracking: Tracking; countries: ManagedCountry[]; genres: ManagedGenre[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const intervalLabel = useIntervalLabel();
  const update = useMutation('updateTracking', `tracking:${tracking.id}`);
  const [depth, setDepth] = useState(String(tracking.depth));
  useEffect(() => setDepth(String(tracking.depth)), [tracking.depth]);

  const draft = toDraft(tracking);
  const { blockers } = previewTracking(draft, countries, genres);
  const title = `${f.genre(tracking.genreId, tracking.genreName)} · ${f.chartType(tracking.chartType)}`;
  const depthValue = Number(depth);
  const depthInvalid = !Number.isInteger(depthValue) || depthValue < 1 || depthValue > 200;
  const intervals = withCurrent(INTERVAL_CHOICES, tracking.intervalMinutes);

  return (
    <li className={cn('rounded-lg border border-line p-4', !tracking.active && 'bg-surface-2')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <p className={cn('mt-0.5 text-[12.5px]', tracking.targetCharts > 0 ? 'text-ink-2' : 'text-ink-3')}>
            {tracking.targetCharts > 0
              ? t('manage.tracking.collects', { count: tracking.targetCharts })
              : <BlockerText blockers={blockers} />}
          </p>
        </div>
        <Switch checked={tracking.active} busy={update.saving} label={t('manage.tracking.activeLabel', { name: title })}
          onChange={(active) => update.run({ id: tracking.id, active })} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select label={t('manage.tracking.interval')} showLabel value={String(tracking.intervalMinutes)}
          options={intervals.map((m) => ({ value: String(m), label: intervalLabel(m) }))}
          onChange={(v) => update.run({ id: tracking.id, intervalMinutes: Number(v) })} />
        <form className="flex items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (!depthInvalid) update.run({ id: tracking.id, depth: depthValue });
        }}>
          <Field label={t('manage.tracking.depth')} error={depthInvalid ? t('manage.error.depth') : update.fieldErrors.depth}
            className="flex-1">
            {({ id, describedBy, invalid }) => (
              <TextInput id={id} describedBy={describedBy} invalid={invalid} type="number" min={1} max={200}
                inputMode="numeric" value={depth} onChange={setDepth} className="tnum" />
            )}
          </Field>
          {depthValue !== tracking.depth && (
            <Button type="submit" size="sm" variant="primary" className="mb-0.5" disabled={depthInvalid}>{t('manage.action.save')}</Button>
          )}
        </form>
      </div>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-3 text-[13px] text-ink-2">
          <Switch checked={tracking.allCountries} busy={update.saving} label={t('manage.tracking.allCountries')}
            onChange={(allCountries) => update.run({ id: tracking.id, allCountries })} />
          {t('manage.tracking.allCountries')}
        </label>
        {!tracking.allCountries && <TrackingCountries tracking={tracking} countries={countries} />}
      </div>
      {update.error && <div className="mt-3"><SaveError error={update.error} /></div>}
    </li>
  );
}

function TrackingCountries({ tracking, countries }: { tracking: Tracking; countries: ManagedCountry[] }) {
  const { t } = useTranslation();
  const active = new Set(tracking.countries.filter((c) => c.active).map((c) => c.code));
  return (
    <div role="group" aria-label={t('manage.tracking.countries')} className="flex flex-wrap gap-1.5">
      {sortCountries(countries).map((c) => <TrackingCountryChip key={c.code} trackingId={tracking.id} country={c} selected={active.has(c.code)} />)}
    </div>
  );
}

function TrackingCountryChip({ trackingId, country, selected }: { trackingId: number; country: ManagedCountry; selected: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const save = useMutation('setTrackingCountry', `tracking:${trackingId}:country:${country.code}`);
  return (
    <span title={country.enabled ? undefined : t('manage.tracking.countryOff')}>
      <ToggleChip selected={selected} muted={!country.enabled} disabled={save.saving}
        onChange={(on) => save.run({ id: trackingId, code: country.code, active: on })}>
        <span aria-hidden>{flag(country.code)}</span>{f.country(country.code)}
      </ToggleChip>
    </span>
  );
}

function BlockerText({ blockers }: { blockers: Blocker[] }) {
  const { t } = useTranslation();
  if (blockers.length === 0) return <>{t('manage.tracking.collects', { count: 0 })}</>;
  return <>{blockers.map((b) => t(`manage.blocker.${b}`)).join(' ')}</>;
}

// ----------------------------------------------------------------- add form

function AddTrackingForm({ countries, genres, trackings }: { countries: ManagedCountry[]; genres: ManagedGenre[]; trackings: Tracking[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const intervalLabel = useIntervalLabel();
  const add = useMutation('addTracking');
  const choices = useMemo(() => genreChoices(genres), [genres]);
  const [draft, setDraft] = useState<TrackingDraft>(() => ({
    genreId: choices[0]?.id ?? null, chartType: 'TOP_FREE', depth: DEFAULT_DEPTH, intervalMinutes: DEFAULT_INTERVAL,
    allCountries: false, active: true, countries: countries.filter((c) => c.enabled).map((c) => c.code),
  }));
  const [depthText, setDepthText] = useState(String(DEFAULT_DEPTH));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<TrackingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // Countries load after the form mounts: preselect the enabled ones once they arrive.
  const enabledCodes = countries.filter((c) => c.enabled).map((c) => c.code).join(',');
  useEffect(() => {
    setDraft((d) => (d.countries.length === 0 && enabledCodes ? { ...d, countries: enabledCodes.split(',') } : d));
  }, [enabledCodes]);
  useEffect(() => {
    if (add.status === 'success') setErrors({});
  }, [add.status]);

  const preview = previewTracking(draft, countries, genres);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateTracking(draft, trackings);
    setErrors(found);
    if (Object.keys(found).length > 0 || draft.genreId == null) return;
    add.run({ ...draft, genreId: draft.genreId });
  };
  const fieldError = (field: string) => (errors[field] ? t(errors[field]!) : add.fieldErrors[field]);
  const toggleCountry = (code: string, on: boolean) =>
    set({ countries: on ? [...draft.countries, code] : draft.countries.filter((c) => c !== code) });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <Combobox label={t('manage.tracking.genre')} showLabel value={String(draft.genreId ?? '')}
          noMatch={t('manage.genres.none')} placeholder={t('context.categorySearch')}
          options={choices.map((g) => ({
            value: String(g.id),
            label: g.enabled ? f.genre(g.id, g.name) : t('manage.genres.offSuffix', { name: f.genre(g.id, g.name) }),
            keywords: `${g.name} ${g.id}`,
          }))}
          onChange={(v) => set({ genreId: Number(v) })} />
        {fieldError('genreId') && <p role="alert" className="mt-1 text-[12px] text-down">{fieldError('genreId')}</p>}
      </div>
      <div className="space-y-1">
        <p className="text-[12.5px] font-medium text-ink-2">{t('manage.tracking.chartType')}</p>
        <SegmentedControl label={t('manage.tracking.chartType')} value={draft.chartType} size="sm"
          options={CHART_TYPES.map((type) => ({ value: type, label: f.chartType(type) }))}
          onChange={(chartType: ChartType) => set({ chartType })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('manage.tracking.depth')} hint={t('manage.tracking.depthHint')} error={fieldError('depth')}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} describedBy={describedBy} invalid={invalid} type="number" min={1} max={200} inputMode="numeric"
              value={depthText} className="tnum"
              onChange={(v) => { setDepthText(v); set({ depth: Number(v) }); }} />
          )}
        </Field>
        <Select label={t('manage.tracking.interval')} showLabel value={String(draft.intervalMinutes)}
          options={INTERVAL_CHOICES.map((m) => ({ value: String(m), label: intervalLabel(m) }))}
          onChange={(v) => set({ intervalMinutes: Number(v) })} />
      </div>
      <label className="flex items-center gap-3 text-[13px] text-ink-2">
        <Switch checked={draft.allCountries} onChange={(allCountries) => set({ allCountries })} label={t('manage.tracking.allCountries')} />
        {t('manage.tracking.allCountries')}
      </label>
      {!draft.allCountries && (
        <div role="group" aria-label={t('manage.tracking.countries')} className="flex flex-wrap gap-1.5">
          {sortCountries(countries).map((c) => (
            <ToggleChip key={c.code} selected={draft.countries.includes(c.code)} muted={!c.enabled}
              onChange={(on) => toggleCountry(c.code, on)}>
              <span aria-hidden>{flag(c.code)}</span>{f.country(c.code)}
            </ToggleChip>
          ))}
        </div>
      )}
      <Notice tone={preview.charts.length > 0 ? 'info' : 'warning'}>
        {preview.charts.length > 0
          ? t('manage.tracking.preview', { count: preview.charts.length, countries: f.list(preview.charts.map((c) => f.country(c))) })
          : <BlockerText blockers={preview.blockers} />}
      </Notice>
      <Button type="submit" variant="primary" busy={add.saving} icon={<Plus aria-hidden className="size-3.5" />}>
        {t('manage.tracking.add')}
      </Button>
      {add.status === 'success' && <Notice tone="success">{t('manage.tracking.added')}</Notice>}
      <SaveError error={add.error} />
    </form>
  );
}

// ------------------------------------------------------------------ genres

function GenreList({ genres, countries, trackings }: { genres: ManagedGenre[]; countries: ManagedCountry[]; trackings: Tracking[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [filter, setFilter] = useState('');
  const tracked = new Set(trackings.map((tr) => tr.genreId));
  const q = filter.trim().toLowerCase();
  // Games and their subgenres, plus any tracked genre; the filter searches all of them.
  const shown = genres
    .filter((g) => (q ? `${g.name} ${f.genre(g.id, g.name)} ${g.id}`.toLowerCase().includes(q)
      : g.id === GAMES || g.parentId === GAMES || tracked.has(g.id)))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || f.genre(a.id, a.name).localeCompare(f.genre(b.id, b.name)));

  return (
    <div className="space-y-3">
      <Field label={t('manage.genres.filter')}>
        {({ id }) => <TextInput id={id} type="search" value={filter} onChange={setFilter} className="sm:max-w-xs" />}
      </Field>
      {shown.length === 0 ? <EmptyState>{t('manage.genres.none')}</EmptyState> : (
        <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((g) => <GenreRow key={g.id} genre={g} genres={genres} countries={countries} trackings={trackings} />)}
        </ul>
      )}
    </div>
  );
}

function GenreRow({ genre, genres, countries, trackings }: {
  genre: ManagedGenre; genres: ManagedGenre[]; countries: ManagedCountry[]; trackings: Tracking[];
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const save = useMutation('updateGenre', `genre:${genre.id}`);
  const name = f.genre(genre.id, genre.name);
  const impact = genreSwitchImpact(genre.id, !genre.enabled, countries, genres, trackings);
  return (
    <li className="flex items-center gap-3 border-b border-line py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">{name}<span className="ms-2 text-[12px] text-ink-3 tnum">{genre.id}</span></p>
        <p className="text-[12px] text-ink-3">
          {!genre.availableOnApple ? t('manage.genres.gone')
            : impact > 0 ? t(genre.enabled ? 'manage.genres.wouldStop' : 'manage.genres.wouldStart', { count: impact })
              : null}
        </p>
        {save.error && <SaveError error={save.error} />}
      </div>
      <Switch checked={genre.enabled} busy={save.saving} label={t('manage.genres.enable', { name })}
        onChange={(enabled) => save.run({ id: genre.id, enabled })} />
    </li>
  );
}

// ----------------------------------------------------------------- helpers

function toDraft(tr: Tracking): TrackingDraft {
  return {
    genreId: tr.genreId, chartType: tr.chartType, depth: tr.depth, intervalMinutes: tr.intervalMinutes,
    allCountries: tr.allCountries, active: tr.active, countries: tr.countries.filter((c) => c.active).map((c) => c.code),
  };
}

/** Enabled countries first, then by code. */
function sortCountries(countries: ManagedCountry[]): ManagedCountry[] {
  return [...countries].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.code.localeCompare(b.code));
}

/** Genres that can be tracked: on Apple; enabled first, then Games subgenres, then the rest. */
function genreChoices(genres: ManagedGenre[]): ManagedGenre[] {
  const rank = (g: ManagedGenre) => (g.enabled ? 0 : g.parentId === GAMES ? 1 : 2);
  return genres.filter((g) => g.availableOnApple && g.id !== 36)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The offered intervals, plus the current one when it was set to something else. */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current) ? [...choices] : [...choices, current].sort((a, b) => a - b);
}
