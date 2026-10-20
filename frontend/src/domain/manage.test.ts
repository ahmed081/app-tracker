import { describe, expect, it } from 'vitest';
import type { ChartStatus, EventRules, ManagedCountry, ManagedGenre, Tracking } from '@/api/manageTypes';
import {
  collectorHealth, countrySwitchImpact, groupCategories, parseReasons, previewCategory, sameRules, targetCharts,
  validateCategory, validateCountry, validateRules, type CategoryDraft,
} from './manage';

const country = (code: string, enabled = true): ManagedCountry => ({ code, name: code.toUpperCase(), enabled, activeCharts: 0 });
const genre = (id: number, over: Partial<ManagedGenre> = {}): ManagedGenre =>
  ({ id, name: `G${id}`, parentId: 6014, enabled: true, availableOnApple: true, ...over });
const tracking = (over: Partial<Tracking> = {}): Tracking => ({
  id: 1, genreId: 7006, genreName: 'Casino', chartType: 'TOP_FREE', depth: 200, intervalMinutes: 720,
  allCountries: false, active: true, countries: [{ code: 'ph', active: true }], targetCharts: 1, ...over,
});
const draft = (over: Partial<CategoryDraft> = {}): CategoryDraft => ({
  genreId: 7006, enabled: true, chartTypes: ['TOP_FREE'], depth: 200, intervalMinutes: 720, allCountries: false,
  countries: ['ph'], ...over,
});
const chartStatus = (over: Partial<ChartStatus> = {}): ChartStatus => ({
  key: 'ph/7006/top-free', country: 'ph', countryName: 'Philippines', genreId: 7006, genreName: 'Casino',
  chartType: 'TOP_FREE', active: true, intervalMinutes: 720, lastAttemptAt: '2026-10-20T00:00:00Z',
  lastValidReadingAt: '2026-10-20T00:00:00Z', lastSlot: '2026-10-20T00:00:00Z', lastStatus: 'VALID',
  lastReasons: null, lastEntryCount: 100, delayed: false, pendingSnapshots: 0, ...over,
});

describe('target charts', () => {
  const countries = [country('ph'), country('us', false), country('gb')];
  const genres = [genre(7006), genre(7005, { enabled: false }), genre(7004, { availableOnApple: false })];

  it('collects a chart only when every switch is on', () => {
    expect(targetCharts(countries, genres, [tracking()]).map((t) => t.country)).toEqual(['ph']);
    expect(targetCharts(countries, genres, [tracking({ active: false })])).toEqual([]);
    expect(targetCharts(countries, genres, [tracking({ genreId: 7005 })])).toEqual([]);   // genre off
    expect(targetCharts(countries, genres, [tracking({ genreId: 7004 })])).toEqual([]);   // gone from Apple
    expect(targetCharts(countries, genres, [tracking({ countries: [{ code: 'ph', active: false }] })])).toEqual([]);
    // all countries: every enabled country, whatever tracking_country says
    expect(targetCharts(countries, genres, [tracking({ allCountries: true, countries: [] })]).map((t) => t.country))
      .toEqual(['ph', 'gb']);
  });

  it('explains why a category collects nothing', () => {
    expect(previewCategory(draft(), countries, genres)).toEqual({ countries: ['ph'], charts: 1, blockers: [] });
    expect(previewCategory(draft({ chartTypes: ['TOP_FREE', 'TOP_PAID'], allCountries: true }), countries, genres))
      .toEqual({ countries: ['ph', 'gb'], charts: 4, blockers: [] });
    expect(previewCategory(draft({ enabled: false }), countries, genres).blockers).toEqual(['genreOff']);
    expect(previewCategory(draft({ genreId: 7004 }), countries, genres).blockers).toEqual(['genreGone']);
    expect(previewCategory(draft({ chartTypes: [] }), countries, genres).blockers).toEqual(['noChartType']);
    expect(previewCategory(draft({ countries: [] }), countries, genres).blockers).toEqual(['noCountries']);
    expect(previewCategory(draft({ countries: ['us'] }), countries, genres).blockers).toEqual(['countriesOff']);
  });

  it('shows each category once, with the settings its chart types share', () => {
    const rows = [
      tracking({ id: 2, chartType: 'TOP_PAID', active: false, countries: [{ code: 'gb', active: true }], targetCharts: 0 }),
      tracking(),
      tracking({ id: 3, genreId: 7005, genreName: 'Card' }),
    ];
    const [casino, card] = groupCategories(rows, [genre(7006, { name: 'Casino' }), genre(7005, { name: 'Card', enabled: false })]);
    expect(casino).toMatchObject({
      genreId: 7006, enabled: true, chartTypes: ['TOP_FREE'], depth: 200, intervalMinutes: 720,
      countries: ['gb', 'ph'], mixed: true, targetCharts: 1,
    });
    expect(casino!.rows.map((r) => r.chartType)).toEqual(['TOP_FREE', 'TOP_PAID']);
    expect(card).toMatchObject({ genreId: 7005, enabled: false, mixed: false });   // switched-off categories last
  });

  it('counts the charts a country switch starts or stops', () => {
    const trackings = [tracking(), tracking({ id: 2, chartType: 'TOP_PAID' })];
    expect(countrySwitchImpact('ph', false, countries, genres, trackings)).toBe(2);
    expect(countrySwitchImpact('us', true, countries, genres, trackings)).toBe(0);   // not tracked in the US
  });
});

describe('validation', () => {
  it('checks a new country', () => {
    expect(validateCountry({ code: 'PH ', name: 'Philippines' }, [country('ph')])).toEqual({ code: 'manage.error.countryExists' });
    expect(validateCountry({ code: 'phl', name: ' ' }, [])).toEqual({ code: 'manage.error.countryCode', name: 'manage.error.name' });
    expect(validateCountry({ code: 'jp', name: 'Japan' }, [])).toEqual({});
  });

  it('checks a new category', () => {
    const existing = groupCategories([tracking()], [genre(7006)]);
    expect(validateCategory(draft(), existing)).toEqual({ genreId: 'manage.error.categoryExists' });
    expect(validateCategory(draft({ genreId: 7005 }), existing)).toEqual({});
    expect(validateCategory(draft({ genreId: null, chartTypes: [], depth: 0, intervalMinutes: 2000 }), existing)).toEqual({
      genreId: 'manage.error.required', chartTypes: 'manage.error.chartTypes',
      depth: 'manage.error.depth', intervalMinutes: 'manage.error.interval',
    });
  });

  it('checks event rules like the backend', () => {
    const ok: EventRules = { tiers: [10, 5], bigMovePlaces: 5, risingHours: 24, risingGainPercent: 50, risingMinNetPlaces: 10, newBestAfterDays: 7 };
    const choices = [3, 5, 10, 20];
    expect(validateRules(ok, choices)).toEqual({});
    expect(validateRules({ ...ok, tiers: [7] }, choices)).toEqual({ tiers: 'manage.error.tiersChoice' });
    expect(validateRules({ ...ok, tiers: [], bigMovePlaces: 1 }, choices))
      .toEqual({ tiers: 'manage.error.tiersEmpty', bigMovePlaces: 'manage.error.range' });
    expect(validateRules({ ...ok, risingHours: 1, risingGainPercent: 101 }, choices))
      .toEqual({ risingHours: 'manage.error.range', risingGainPercent: 'manage.error.range' });
    expect(sameRules(ok, { ...ok, tiers: [5, 10] })).toBe(true);
    expect(sameRules(ok, { ...ok, bigMovePlaces: 6 })).toBe(false);
  });
});

describe('collector health', () => {
  const collector = { targetCharts: 1, lastAttemptAt: null, lastValidReadingAt: null };

  it('grades the collector from its charts', () => {
    expect(collectorHealth({ collector: { ...collector, targetCharts: 0 }, charts: [] }).level).toBe('idle');
    expect(collectorHealth({ collector, charts: [chartStatus({ lastAttemptAt: null, delayed: true })] }).level).toBe('waiting');
    expect(collectorHealth({ collector, charts: [chartStatus()] }).level).toBe('ok');
    expect(collectorHealth({ collector, charts: [chartStatus({ lastStatus: 'INCOMPLETE' })] })).toMatchObject({ level: 'warning', failing: 1 });
    expect(collectorHealth({ collector, charts: [chartStatus({ delayed: true }), chartStatus({ key: 'b' })] }).level).toBe('delayed');
    expect(collectorHealth({ collector, charts: [chartStatus({ delayed: true })] }).level).toBe('stopped');
    // inactive charts never count
    expect(collectorHealth({ collector, charts: [chartStatus(), chartStatus({ key: 'x', active: false, lastStatus: 'FAILED' })] }).level).toBe('ok');
  });

  it('reads the collector reason codes', () => {
    expect(parseReasons('below_min_entries:12')).toEqual([{ code: 'below_min_entries', detail: '12' }]);
    expect(parseReasons('fetch_error:HTTP 503')).toEqual([{ code: 'fetch_error', detail: 'HTTP 503' }]);
    expect(parseReasons('invalid_app_id:rank_4;missing_name:rank_9')).toEqual([
      { code: 'invalid_app_id', detail: '#4' }, { code: 'missing_name', detail: '#9' }]);
    expect(parseReasons('unparsable body: Unexpected token')).toEqual([{ code: 'unparsable_body', detail: 'Unexpected token' }]);
    expect(parseReasons('no feed object')).toEqual([{ code: 'no_feed', detail: '' }]);
    expect(parseReasons('something new')).toEqual([{ code: 'other', detail: 'something new' }]);
    expect(parseReasons(null)).toEqual([]);
  });
});
