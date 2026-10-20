import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { ChartType } from '@/api/types';
import type { CategoryUpdate, ManagedCountry, ManagedGenre } from '@/api/manageTypes';
import {
  CHART_TYPES, DEFAULT_DEPTH, DEFAULT_INTERVAL, INTERVAL_CHOICES, groupCategories, previewCategory, validateCategory,
  type Blocker, type Category, type CategoryDraft, type FieldErrors,
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
import { Combobox, normalize } from '@/components/ui/Combobox';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { Loaded, NO_PARAMS, SaveError, useIntervalLabel } from './shared';

const GAMES = 6014;
type Show = 'all' | 'on' | 'off';

/** One entry per category: its switch, its chart types and the settings they share. */
export function TrackingPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const countries = useResource('manageCountries', NO_PARAMS);
  const genres = useResource('manageGenres', NO_PARAMS);
  const tracking = useResource('manageTracking', NO_PARAMS);
  const countryList = countries.data ?? [];
  const genreList = genres.data ?? [];
  const categories = useMemo(() => groupCategories(tracking.data ?? [], genreList), [tracking.data, genreList]);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [adding, setAdding] = useState(false);

  // Search by category name or ID, chart type or country.
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const shown = categories.filter((c) => (show === 'all' || c.enabled === (show === 'on')) && words.every((w) => normalize([
    c.name, f.genre(c.genreId, c.name), c.genreId, ...c.chartTypes.map((type) => f.chartType(type)),
    ...c.countries.map((code) => `${code} ${f.country(code)}`),
  ].join(' ')).includes(w)));

  return (
    <div className="space-y-6">
      <Notice>{t('manage.tracking.appliesWithin')}</Notice>
      <Panel title={t('manage.tracking.title')} description={t('manage.tracking.hint')}
        action={!adding && (
          <Button size="sm" variant="primary" icon={<Plus aria-hidden className="size-3.5" />} onClick={() => setAdding(true)}>
            {t('manage.tracking.addTitle')}
          </Button>
        )}>
        {adding && (
          <div className="mb-5 rounded-lg border border-line-strong p-4">
            <Loaded resource={genres} rows={4}>
              {(list) => <AddCategoryForm countries={countryList} genres={list} categories={categories}
                onDone={() => setAdding(false)} />}
            </Loaded>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label={t('manage.tracking.search')} className="min-w-0 flex-1 sm:max-w-sm">
            {({ id }) => <TextInput id={id} type="search" value={query} onChange={setQuery}
              placeholder={t('manage.tracking.searchHint')} />}
          </Field>
          <SegmentedControl label={t('manage.tracking.show')} value={show} size="sm" onChange={setShow}
            options={(['all', 'on', 'off'] as const).map((value) => ({ value, label: t(`manage.tracking.show_${value}`) }))} />
        </div>
        <Loaded resource={tracking} rows={4}>
          {() => categories.length === 0 ? <EmptyState>{t('manage.tracking.empty')}</EmptyState>
            : shown.length === 0 ? <EmptyState>{t('manage.genres.none')}</EmptyState> : (
              <ul className="space-y-3">
                {shown.map((c) => <CategoryCard key={c.genreId} category={c} countries={countryList} genres={genreList} />)}
              </ul>
            )}
        </Loaded>
      </Panel>
    </div>
  );
}

// --------------------------------------------------------------- one category

function CategoryCard({ category, countries, genres }: { category: Category; countries: ManagedCountry[]; genres: ManagedGenre[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const intervalLabel = useIntervalLabel();
  const save = useMutation('saveCategory', `category:${category.genreId}`);
  const run = (patch: CategoryUpdate) => save.run({ genreId: category.genreId, ...patch });
  const name = f.genre(category.genreId, category.name);
  const { blockers } = previewCategory(toDraft(category), countries, genres);

  const [depth, setDepth] = useState(category.depth == null ? '' : String(category.depth));
  useEffect(() => setDepth(category.depth == null ? '' : String(category.depth)), [category.depth]);
  const depthValue = Number(depth);
  const depthInvalid = !Number.isInteger(depthValue) || depthValue < 1 || depthValue > 200;
  const intervals = category.intervalMinutes == null ? [...INTERVAL_CHOICES] : withCurrent(INTERVAL_CHOICES, category.intervalMinutes);

  return (
    <li className={cn('rounded-lg border border-line p-4', !category.enabled && 'bg-surface-2')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink">
            <span dir="auto">{name}</span><span className="ms-2 text-[12px] font-normal text-ink-3 tnum">{category.genreId}</span>
          </h3>
          <p className={cn('mt-0.5 text-[12.5px]', category.targetCharts > 0 ? 'text-ink-2' : 'text-ink-3')}>
            {!category.enabled ? t('manage.tracking.offKept')
              : category.targetCharts > 0 ? t('manage.tracking.collects', { count: category.targetCharts })
                : <BlockerText blockers={blockers} />}
          </p>
        </div>
        <Switch checked={category.enabled} busy={save.saving} label={t('manage.genres.enable', { name })}
          onChange={(enabled) => run({ enabled })} />
      </div>

      {category.enabled && (
        <>
          <div className="mt-4 space-y-1">
            <p className="text-[12.5px] font-medium text-ink-2">{t('manage.tracking.chartTypes')}</p>
            <ChartTypeChips value={category.chartTypes} disabled={save.saving}
              onChange={(chartTypes) => run({ chartTypes })} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select label={t('manage.tracking.interval')} showLabel value={String(category.intervalMinutes ?? '')}
              options={[
                ...(category.intervalMinutes == null ? [{ value: '', label: t('manage.tracking.mixedValue'), disabled: true }] : []),
                ...intervals.map((m) => ({ value: String(m), label: intervalLabel(m) })),
              ]}
              onChange={(v) => v && run({ intervalMinutes: Number(v) })} />
            <form className="flex items-end gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!depthInvalid) run({ depth: depthValue });
            }}>
              <Field label={t('manage.tracking.depth')} className="flex-1"
                error={depth !== '' && depthInvalid ? t('manage.error.depth') : save.fieldErrors.depth}>
                {({ id, describedBy, invalid }) => (
                  <TextInput id={id} describedBy={describedBy} invalid={invalid} type="number" min={1} max={200}
                    inputMode="numeric" value={depth} onChange={setDepth} className="tnum"
                    placeholder={category.depth == null ? t('manage.tracking.mixedValue') : undefined} />
                )}
              </Field>
              {depthValue !== category.depth && depth !== '' && (
                <Button type="submit" size="sm" variant="primary" className="mb-0.5" disabled={depthInvalid}>
                  {t('manage.action.save')}
                </Button>
              )}
            </form>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-3 text-[13px] text-ink-2">
              <Switch checked={category.allCountries === true} busy={save.saving} label={t('manage.tracking.allCountries')}
                onChange={(allCountries) => run({ allCountries })} />
              {t('manage.tracking.allCountries')}
            </label>
            {category.allCountries !== true && (
              <CountryChips countries={countries} value={category.countries} disabled={save.saving}
                onChange={(codes) => run({ countries: codes })} />
            )}
          </div>
          {category.mixed && <p className="mt-3 text-[12px] text-ink-3">{t('manage.tracking.mixed')}</p>}
        </>
      )}
      {save.error && <div className="mt-3"><SaveError error={save.error} /></div>}
    </li>
  );
}

// ---------------------------------------------------------------- add form

function AddCategoryForm({ countries, genres, categories, onDone }: {
  countries: ManagedCountry[]; genres: ManagedGenre[]; categories: Category[]; onDone: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const intervalLabel = useIntervalLabel();
  const add = useMutation('saveCategory', 'category:new');
  const choices = useMemo(() => genreChoices(genres, categories), [genres, categories]);
  const enabledCodes = countries.filter((c) => c.enabled).map((c) => c.code);
  const [draft, setDraft] = useState<CategoryDraft>(() => ({
    genreId: null, enabled: true, chartTypes: ['TOP_FREE'], depth: DEFAULT_DEPTH, intervalMinutes: DEFAULT_INTERVAL,
    allCountries: false, countries: enabledCodes,
  }));
  const [depthText, setDepthText] = useState(String(DEFAULT_DEPTH));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<CategoryDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // Close once saved; the new category then appears in the list.
  useEffect(() => {
    if (add.status === 'success') {
      add.reset();
      onDone();
    }
  }, [add, onDone]);

  const preview = previewCategory(draft, countries, genres);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateCategory(draft, categories);
    setErrors(found);
    if (Object.keys(found).length > 0 || draft.genreId == null) return;
    const { genreId, ...body } = draft;
    add.run({ genreId, ...body });
  };
  const fieldError = (field: string) => (errors[field] ? t(errors[field]!) : add.fieldErrors[field]);

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <h3 className="text-[14px] font-semibold text-ink">{t('manage.tracking.addTitle')}</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-3">{t('manage.tracking.addHint')}</p>
      </div>
      <div>
        <Combobox label={t('manage.tracking.genre')} showLabel value={String(draft.genreId ?? '')}
          noMatch={t('manage.genres.none')} placeholder={t('context.categorySearch')}
          options={choices.map((g) => ({ value: String(g.id), label: f.genre(g.id, g.name), keywords: `${g.name} ${g.id}` }))}
          onChange={(v) => set({ genreId: Number(v) })} />
        {fieldError('genreId') && <p role="alert" className="mt-1 text-[12px] text-down">{fieldError('genreId')}</p>}
      </div>
      <div className="space-y-1">
        <p className="text-[12.5px] font-medium text-ink-2">{t('manage.tracking.chartTypes')}</p>
        <ChartTypeChips value={draft.chartTypes} onChange={(chartTypes) => set({ chartTypes })} />
        {fieldError('chartTypes') && <p role="alert" className="text-[12px] text-down">{fieldError('chartTypes')}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t('manage.tracking.interval')} showLabel value={String(draft.intervalMinutes)}
          options={INTERVAL_CHOICES.map((m) => ({ value: String(m), label: intervalLabel(m) }))}
          onChange={(v) => set({ intervalMinutes: Number(v) })} />
        <Field label={t('manage.tracking.depth')} hint={t('manage.tracking.depthHint')} error={fieldError('depth')}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} describedBy={describedBy} invalid={invalid} type="number" min={1} max={200} inputMode="numeric"
              value={depthText} className="tnum"
              onChange={(v) => { setDepthText(v); set({ depth: Number(v) }); }} />
          )}
        </Field>
      </div>
      <label className="flex items-center gap-3 text-[13px] text-ink-2">
        <Switch checked={draft.allCountries} onChange={(allCountries) => set({ allCountries })} label={t('manage.tracking.allCountries')} />
        {t('manage.tracking.allCountries')}
      </label>
      {!draft.allCountries && (
        <CountryChips countries={countries} value={draft.countries} onChange={(codes) => set({ countries: codes })} />
      )}
      {draft.genreId != null && (
        <Notice tone={preview.charts > 0 ? 'info' : 'warning'}>
          {preview.charts > 0
            ? t('manage.tracking.preview', { count: preview.charts, countries: f.list(preview.countries.map((c) => f.country(c))) })
            : <BlockerText blockers={preview.blockers} />}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={add.saving} icon={<Plus aria-hidden className="size-3.5" />}>
          {t('manage.tracking.add')}
        </Button>
        <Button variant="ghost" onClick={onDone}>{t('manage.action.cancel')}</Button>
      </div>
      <SaveError error={add.error} />
    </form>
  );
}

// ------------------------------------------------------------------- pieces

function ChartTypeChips({ value, onChange, disabled }: { value: ChartType[]; onChange: (types: ChartType[]) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <div role="group" aria-label={t('manage.tracking.chartTypes')} className="flex flex-wrap gap-1.5">
      {CHART_TYPES.map((type) => (
        <ToggleChip key={type} selected={value.includes(type)} disabled={disabled}
          onChange={(on) => onChange(CHART_TYPES.filter((x) => (x === type ? on : value.includes(x))))}>
          {f.chartType(type)}
        </ToggleChip>
      ))}
    </div>
  );
}

function CountryChips({ countries, value, onChange, disabled }: {
  countries: ManagedCountry[]; value: string[]; onChange: (codes: string[]) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <div role="group" aria-label={t('manage.tracking.countries')} className="flex flex-wrap gap-1.5">
      {sortCountries(countries).map((c) => (
        <span key={c.code} title={c.enabled ? undefined : t('manage.tracking.countryOff')}>
          <ToggleChip selected={value.includes(c.code)} muted={!c.enabled} disabled={disabled}
            onChange={(on) => onChange(on ? [...value, c.code] : value.filter((x) => x !== c.code))}>
            <span aria-hidden>{flag(c.code)}</span>{f.country(c.code)}
          </ToggleChip>
        </span>
      ))}
    </div>
  );
}

function BlockerText({ blockers }: { blockers: Blocker[] }) {
  const { t } = useTranslation();
  if (blockers.length === 0) return <>{t('manage.tracking.collects', { count: 0 })}</>;
  return <>{blockers.map((b) => t(`manage.blocker.${b}`)).join(' ')}</>;
}

// ----------------------------------------------------------------- helpers

function toDraft(c: Category): CategoryDraft {
  return {
    genreId: c.genreId, enabled: c.enabled, chartTypes: c.chartTypes, depth: c.depth ?? DEFAULT_DEPTH,
    intervalMinutes: c.intervalMinutes ?? DEFAULT_INTERVAL, allCountries: c.allCountries === true, countries: c.countries,
  };
}

/** Enabled countries first, then by code. */
function sortCountries(countries: ManagedCountry[]): ManagedCountry[] {
  return [...countries].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.code.localeCompare(b.code));
}

/** Categories that can be added: on Apple and not tracked yet; Games subgenres first. */
function genreChoices(genres: ManagedGenre[], categories: Category[]): ManagedGenre[] {
  const tracked = new Set(categories.map((c) => c.genreId));
  const rank = (g: ManagedGenre) => (g.parentId === GAMES ? 0 : 1);
  return genres.filter((g) => g.availableOnApple && g.id !== 36 && !tracked.has(g.id))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The offered intervals, plus the current one when it was set to something else. */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current) ? [...choices] : [...choices, current].sort((a, b) => a - b);
}
