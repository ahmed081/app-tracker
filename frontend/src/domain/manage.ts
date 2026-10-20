// Pure rules of the Settings menu: which charts get collected, previews of a
// change, form validation, collector health and snapshot reason codes.
import type { ChartType } from '@/api/types';
import type {
  ChartStatus, EventRules, ManagedCountry, ManagedGenre, StatusResponse, Tracking,
} from '@/api/manageTypes';

export const CHART_TYPES: readonly ChartType[] = ['TOP_FREE', 'TOP_PAID', 'TOP_GROSSING'];
/** Collection intervals offered in the form, in minutes (the database accepts 5–1440). */
export const INTERVAL_CHOICES = [60, 180, 360, 720, 1440] as const;
export const DEFAULT_INTERVAL = 720;
export const DEFAULT_DEPTH = 200;

// ------------------------------------------------------------ target charts

export interface TargetChart {
  trackingId: number;
  country: string;
  genreId: number;
  chartType: ChartType;
}

/**
 * A chart is collected only if every switch is on. Same rule as the database
 * view v_tracking_target:
 *   country.enabled AND genre.enabled AND genre.available_on_apple AND tracking.active
 *   AND (tracking.all_countries OR tracking_country.active)
 */
export function isCollected(country: ManagedCountry, genre: ManagedGenre | undefined, tracking: Tracking): boolean {
  if (!country.enabled || !genre?.enabled || !genre.availableOnApple || !tracking.active) return false;
  return tracking.allCountries || tracking.countries.some((c) => c.code === country.code && c.active);
}

export function targetCharts(countries: ManagedCountry[], genres: ManagedGenre[], trackings: Tracking[]): TargetChart[] {
  const genreById = new Map(genres.map((g) => [g.id, g]));
  return trackings.flatMap((t) => countries
    .filter((c) => isCollected(c, genreById.get(t.genreId), t))
    .map((c) => ({ trackingId: t.id, country: c.code, genreId: t.genreId, chartType: t.chartType })));
}

// --------------------------------------------------------------- categories
// The Settings page shows one entry per category; its tracking rows (one per
// chart type) share their settings.

export interface Category {
  genreId: number;
  name: string;
  enabled: boolean;              // genre.enabled: the category's switch
  availableOnApple: boolean;
  rows: Tracking[];              // in CHART_TYPES order
  chartTypes: ChartType[];       // tracked (active) chart types
  depth: number | null;          // null: the chart types differ
  intervalMinutes: number | null;
  allCountries: boolean | null;
  countries: string[];           // active in at least one chart type
  mixed: boolean;                // some setting differs between chart types
  targetCharts: number;
}

/** Tracked categories (those with a tracking row), switched-on ones first, then by name. */
export function groupCategories(trackings: Tracking[], genres: ManagedGenre[]): Category[] {
  const byGenre = new Map<number, Tracking[]>();
  for (const t of trackings) byGenre.set(t.genreId, [...(byGenre.get(t.genreId) ?? []), t]);
  const same = <T>(values: T[]): T | null => (values.every((v) => v === values[0]) ? values[0] ?? null : null);
  return [...byGenre.entries()].map(([genreId, list]): Category => {
    const rows = [...list].sort((a, b) => CHART_TYPES.indexOf(a.chartType) - CHART_TYPES.indexOf(b.chartType));
    const genre = genres.find((g) => g.id === genreId);
    const countrySets = rows.map((r) => r.countries.filter((c) => c.active).map((c) => c.code).sort().join(','));
    const depth = same(rows.map((r) => r.depth));
    const intervalMinutes = same(rows.map((r) => r.intervalMinutes));
    const allCountries = same(rows.map((r) => r.allCountries));
    return {
      genreId,
      name: genre?.name ?? rows[0]!.genreName,
      enabled: genre?.enabled ?? false,
      availableOnApple: genre?.availableOnApple ?? false,
      rows,
      chartTypes: rows.filter((r) => r.active).map((r) => r.chartType),
      depth,
      intervalMinutes,
      allCountries,
      countries: [...new Set(rows.flatMap((r) => r.countries.filter((c) => c.active).map((c) => c.code)))].sort(),
      mixed: depth === null || intervalMinutes === null || allCountries === null || same(countrySets) === null,
      targetCharts: rows.reduce((n, r) => n + r.targetCharts, 0),
    };
  }).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
}

/** Why a category collects nothing (empty when it collects at least one chart). */
export type Blocker = 'genreOff' | 'genreGone' | 'noChartType' | 'noCountries' | 'countriesOff';

/** A category being added or edited. */
export interface CategoryDraft {
  genreId: number | null;
  enabled: boolean;
  chartTypes: ChartType[];
  depth: number;
  intervalMinutes: number;
  allCountries: boolean;
  countries: string[];
}

/** What a category would collect (country codes, chart count), and why not when nothing. */
export function previewCategory(draft: CategoryDraft, countries: ManagedCountry[], genres: ManagedGenre[]):
  { countries: string[]; charts: number; blockers: Blocker[] } {
  const genre = genres.find((g) => g.id === draft.genreId);
  const collectable = draft.enabled && (genre?.availableOnApple ?? false);
  const where = countries.filter((c) => c.enabled && (draft.allCountries || draft.countries.includes(c.code))).map((c) => c.code);
  const charts = collectable ? where.length * draft.chartTypes.length : 0;
  const blockers: Blocker[] = [];
  if (charts === 0) {
    if (genre && !genre.availableOnApple) blockers.push('genreGone');
    else if (!draft.enabled) blockers.push('genreOff');
    if (draft.chartTypes.length === 0) blockers.push('noChartType');
    if (!draft.allCountries && draft.countries.length === 0) blockers.push('noCountries');
    else if (where.length === 0) blockers.push('countriesOff');
  }
  return { countries: collectable ? where : [], charts, blockers };
}

/** How many charts start or stop if a country is switched to `enabled`. */
export function countrySwitchImpact(code: string, enabled: boolean, countries: ManagedCountry[], genres: ManagedGenre[],
  trackings: Tracking[]): number {
  const changed = countries.map((c) => (c.code === code ? { ...c, enabled } : c));
  const before = targetCharts(countries, genres, trackings).filter((t) => t.country === code).length;
  const after = targetCharts(changed, genres, trackings).filter((t) => t.country === code).length;
  return Math.abs(after - before);
}

// --------------------------------------------------------------- validation
// Same limits as the backend (ManageService, EventRules). Values are i18n keys.

export type FieldErrors = Record<string, string>;

export function validateCountry(draft: { code: string; name: string }, existing: ManagedCountry[]): FieldErrors {
  const errors: FieldErrors = {};
  const code = draft.code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) errors.code = 'manage.error.countryCode';
  else if (existing.some((c) => c.code === code)) errors.code = 'manage.error.countryExists';
  const name = draft.name.trim();
  if (name.length === 0 || name.length > 80) errors.name = 'manage.error.name';
  return errors;
}

export function validateCategory(draft: CategoryDraft, categories: Category[]): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.genreId == null) errors.genreId = 'manage.error.required';
  else if (categories.some((c) => c.genreId === draft.genreId)) errors.genreId = 'manage.error.categoryExists';
  if (draft.chartTypes.length === 0) errors.chartTypes = 'manage.error.chartTypes';
  if (!Number.isInteger(draft.depth) || draft.depth < 1 || draft.depth > 200) errors.depth = 'manage.error.depth';
  if (!Number.isInteger(draft.intervalMinutes) || draft.intervalMinutes < 5 || draft.intervalMinutes > 1440) {
    errors.intervalMinutes = 'manage.error.interval';
  }
  return errors;
}

const RULE_LIMITS: Record<Exclude<keyof EventRules, 'tiers'>, [number, number]> = {
  bigMovePlaces: [2, 50],
  risingHours: [2, 168],
  risingGainPercent: [1, 100],
  risingMinNetPlaces: [1, 200],
  newBestAfterDays: [0, 90],
};

export function ruleLimits(field: Exclude<keyof EventRules, 'tiers'>): [number, number] {
  return RULE_LIMITS[field];
}

export function validateRules(rules: EventRules, tierChoices: readonly number[]): FieldErrors {
  const errors: FieldErrors = {};
  if (rules.tiers.length === 0) errors.tiers = 'manage.error.tiersEmpty';
  else if (!rules.tiers.every((t) => tierChoices.includes(t))) errors.tiers = 'manage.error.tiersChoice';
  for (const [field, [min, max]] of Object.entries(RULE_LIMITS)) {
    const v = rules[field as keyof typeof RULE_LIMITS];
    if (!Number.isInteger(v) || v < min || v > max) errors[field] = 'manage.error.range';
  }
  return errors;
}

export function sameRules(a: EventRules, b: EventRules): boolean {
  const tiers = (r: EventRules) => [...r.tiers].sort((x, y) => x - y).join(',');
  return tiers(a) === tiers(b) && (Object.keys(RULE_LIMITS) as (keyof typeof RULE_LIMITS)[]).every((k) => a[k] === b[k]);
}

// ---------------------------------------------------------- collector health

export type Health = 'ok' | 'warning' | 'delayed' | 'stopped' | 'idle' | 'waiting';

export interface CollectorHealth {
  level: Health;
  active: number;
  delayed: number;
  failing: number;     // active charts whose latest reading is not VALID
}

/**
 *  idle    : nothing to collect (every switch off)
 *  waiting : charts configured, no attempt yet (collector not started, or just switched on)
 *  stopped : every active chart is delayed (no valid reading for more than 2 intervals)
 *  delayed : some active charts are delayed
 *  warning : on time, but some latest readings are INCOMPLETE or FAILED
 *  ok      : everything on time and valid
 */
export function collectorHealth(status: Pick<StatusResponse, 'collector' | 'charts'>): CollectorHealth {
  const active = status.charts.filter((c) => c.active);
  const delayed = active.filter((c) => c.delayed).length;
  const failing = active.filter((c) => c.lastStatus !== null && c.lastStatus !== 'VALID').length;
  const base = { active: active.length, delayed, failing };
  if (status.collector.targetCharts === 0 && active.length === 0) return { level: 'idle', ...base };
  if (active.length === 0 || active.every((c) => c.lastAttemptAt === null)) return { level: 'waiting', ...base };
  if (delayed === active.length) return { level: 'stopped', ...base };
  if (delayed > 0) return { level: 'delayed', ...base };
  if (failing > 0) return { level: 'warning', ...base };
  return { level: 'ok', ...base };
}

/** Problems first, then by name. */
export function sortChartStatuses(charts: ChartStatus[]): ChartStatus[] {
  const weight = (c: ChartStatus) => (!c.active ? 3 : c.delayed ? 0 : c.lastStatus && c.lastStatus !== 'VALID' ? 1 : 2);
  return [...charts].sort((a, b) => weight(a) - weight(b) || a.key.localeCompare(b.key));
}

// -------------------------------------------------------------- reason codes

export type ReasonCode =
  | 'fetch_error' | 'empty_body' | 'unparsable_body' | 'no_feed' | 'zero_entries'
  | 'invalid_app_id' | 'duplicate_app_id' | 'missing_name' | 'below_min_entries' | 'other';

export interface Reason {
  code: ReasonCode;
  detail: string;
}

const KNOWN: ReasonCode[] = ['fetch_error', 'zero_entries', 'invalid_app_id', 'duplicate_app_id', 'missing_name', 'below_min_entries'];

/** "below_min_entries:12;duplicate_app_id:123" → [{code, detail}, ...] (as written by the collector). */
export function parseReasons(reasons: string | null | undefined): Reason[] {
  if (!reasons) return [];
  return reasons.split(';').filter(Boolean).map((raw): Reason => {
    const m = raw.match(/^([a-z_]+)(?::(.*))?$/);
    if (m && KNOWN.includes(m[1] as ReasonCode)) {
      return { code: m[1] as ReasonCode, detail: (m[2] ?? '').replace(/^rank_/, '#') };
    }
    if (raw === 'empty body') return { code: 'empty_body', detail: '' };
    if (raw.startsWith('unparsable body')) return { code: 'unparsable_body', detail: raw.slice(raw.indexOf(':') + 1).trim() };
    if (raw === 'no feed object') return { code: 'no_feed', detail: '' };
    return { code: 'other', detail: raw };
  });
}
