// Radar rules shared by the Radar page and its components: reason chips, the
// "not enough history" rule, sorting, scope choices and theme validation.
import type { Chart } from '@/api/types';
import type { RadarApp, RadarReason } from '@/api/radarTypes';

/** The period is a number of days (backend: 1 to 90). Presets: 4 days, 14 days, last month. */
export const RADAR_PRESET_DAYS = [4, 14, 30] as const;
export const DEFAULT_RADAR_DAYS = 4;
export const MAX_RADAR_DAYS = 90;

/** The API's window parameter: 14 → "14d". */
export const radarWindow = (days: number) => `${days}d`;

/** A typed number of days, or null when it isn't a whole number from 1 to 90. */
export function parseRadarDays(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const days = Number(s);
  return days >= 1 && days <= MAX_RADAR_DAYS ? days : null;
}
/** Apps scoring less are hidden until "Show all". */
export const DEFAULT_MIN_SCORE = 4;
/** Below this much history the page says "not enough history yet". */
export const MIN_HISTORY_DAYS = 7;
/** What the Radar needs to be meaningful ("about 2 weeks of collection"). */
export const GOOD_HISTORY_DAYS = 14;

/**
 * accent: what makes something new (green tag); up: a climb (green with an arrow,
 * never colour alone); neutral: supporting facts.
 */
export type ReasonTone = 'accent' | 'up' | 'neutral';

/** Chip order (most telling first) and tone. Labels: radar.reason.<code>, hints: radar.reasonHint.<code>. */
export const REASONS: Record<RadarReason, { order: number; tone: ReasonTone; points: number }> = {
  HAS_FOLLOWERS: { order: 0, tone: 'accent', points: 3 },
  NEW_IN_CHARTS: { order: 1, tone: 'accent', points: 2 },
  NEW_APP: { order: 2, tone: 'accent', points: 2 },
  CLIMBING: { order: 3, tone: 'up', points: 2 },
  UNKNOWN_THEME: { order: 4, tone: 'accent', points: 2 },
  RATINGS_GROWING: { order: 5, tone: 'up', points: 2 },
  STEADY: { order: 6, tone: 'up', points: 1 },
  RATINGS_FAST: { order: 7, tone: 'up', points: 1 },
  MULTI_COUNTRY: { order: 8, tone: 'neutral', points: 1 },
  NEW_DEVELOPER: { order: 9, tone: 'neutral', points: 1 },
};

/** Known reasons only (a newer backend may send more), in chip order. */
export function sortReasons(reasons: readonly string[]): RadarReason[] {
  return [...new Set(reasons)].filter((r): r is RadarReason => r in REASONS)
    .sort((a, b) => REASONS[a].order - REASONS[b].order);
}

/** Whole days of history since the scope's first reading; null when there is none. */
export function historyDays(dataSince: string | null | undefined, now: number = Date.now()): number | null {
  if (!dataSince) return null;
  return Math.max(0, Math.floor((now - Date.parse(dataSince)) / 86_400_000));
}

/** True when there is less than a week of data: the Radar says so instead of looking empty or wrong. */
export function notEnoughHistory(dataSince: string | null | undefined, now: number = Date.now()): boolean {
  const days = historyDays(dataSince, now);
  return days === null || days < MIN_HISTORY_DAYS;
}

/** Highest score first, then the biggest climb, then the best rank. */
export function sortRadarApps(rows: readonly RadarApp[]): RadarApp[] {
  // Missing values sort last; never subtract two infinities (NaN).
  const big = Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => b.score - a.score
    || (b.placesGained ?? -big) - (a.placesGained ?? -big)
    || (a.currentRank ?? big) - (b.currentRank ?? big));
}

/** Countries that have at least one active chart, in code order. */
export function radarCountries(charts: readonly Chart[]): string[] {
  return [...new Set(charts.filter((c) => c.active).map((c) => c.country))].sort();
}

/** Categories tracked in a country (each once, whatever its chart types), by name. */
export function radarGenres(charts: readonly Chart[], country: string): { id: number; name: string }[] {
  const byId = new Map<number, string>();
  for (const c of charts) if (c.active && c.country === country) byId.set(c.genreId, c.genreName);
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ themes

export const THEME_NAME_MAX = 60;
export const KEYWORD_MAX = 40;
export const KEYWORDS_MAX = 20;

/** Lowercase, single spaces, no repeats or empties (as the backend stores them). */
export function normalizeKeywords(keywords: readonly string[]): string[] {
  const out = keywords.map((k) => k.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean);
  return [...new Set(out)];
}

export type ThemeError = 'required' | 'tooLong' | 'noKeyword' | 'keywordInvalid' | 'tooManyKeywords' | 'duplicate';

/**
 * Field errors (i18n codes) of a theme form, mirroring the backend's limits.
 * `otherNames`: the other themes' names, to catch a duplicate before saving.
 */
export function validateTheme(name: string, keywords: readonly string[], otherNames: readonly string[] = []):
  Partial<Record<'name' | 'keywords', ThemeError>> {
  const errors: Partial<Record<'name' | 'keywords', ThemeError>> = {};
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) errors.name = 'required';
  else if (n.length > THEME_NAME_MAX) errors.name = 'tooLong';
  else if (otherNames.some((o) => o.trim().toLowerCase() === n.toLowerCase())) errors.name = 'duplicate';
  const k = normalizeKeywords(keywords);
  if (k.length === 0) errors.keywords = 'noKeyword';
  else if (k.some((w) => w.length > KEYWORD_MAX || !/[\p{L}\p{N}]/u.test(w))) errors.keywords = 'keywordInvalid';
  else if (k.length > KEYWORDS_MAX) errors.keywords = 'tooManyKeywords';
  return errors;
}

/** The theme a "Save as theme" click creates from an emerging word: "sakura" → "Sakura" / ["sakura"]. */
export function themeFromWord(word: string): { name: string; keywords: string[] } {
  const w = word.trim();
  return { name: w.charAt(0).toLocaleUpperCase() + w.slice(1), keywords: [w.toLowerCase()] };
}
