import { describe, expect, it } from 'vitest';
import type { Chart } from '@/api/types';
import type { RadarApp } from '@/api/radarTypes';
import {
  historyDays, normalizeKeywords, notEnoughHistory, radarCountries, radarGenres, REASONS, sortRadarApps, sortReasons,
  themeFromWord, validateTheme,
} from './radar';

const NOW = Date.parse('2026-10-23T12:00:00Z');

const row = (over: Partial<RadarApp>): RadarApp => ({
  app: null, chart: 'ph/7006/top-free', currentRank: 10, startRank: null, placesGained: null, ratingsGained: null,
  ratingsGrowthPercent: null, ageDays: null, firstSeenAt: null, reasons: [], score: 4, dismissed: false, trend: [], ...over,
});

const chart = (key: string, genreName: string, active = true): Chart => {
  const [country, genreId] = key.split('/');
  return {
    key, country: country!, countryName: country!, genreId: Number(genreId), genreName, chartType: 'TOP_FREE', active,
    intervalMinutes: 720, asOf: null, lastValidReadingAt: null, lastAttemptAt: null, delayed: false,
  };
};

describe('reason chips', () => {
  it('come in a fixed order, unknown ones dropped', () => {
    expect(sortReasons(['STEADY', 'NEW_APP', 'SOMETHING_NEW', 'HAS_FOLLOWERS', 'NEW_APP']))
      .toEqual(['HAS_FOLLOWERS', 'NEW_APP', 'STEADY']);
  });

  it('carry the backend points', () => {
    expect(Object.values(REASONS).reduce((s, r) => s + r.points, 0)).toBe(17);
  });
});

describe('history', () => {
  it('needs a week before the Radar means anything', () => {
    expect(historyDays('2026-10-19T11:00:00Z', NOW)).toBe(4);
    expect(notEnoughHistory('2026-10-19T11:00:00Z', NOW)).toBe(true);
    expect(notEnoughHistory('2026-10-16T11:00:00Z', NOW)).toBe(false);
    expect(notEnoughHistory(null, NOW)).toBe(true);
    expect(historyDays(undefined, NOW)).toBeNull();
  });
});

describe('sorting', () => {
  it('puts the highest score first, then the biggest climb, then the best rank', () => {
    const rows = [
      row({ app: { appleAppId: 'a', name: 'a', developer: null, iconUrl: null, rating: null, ratingCount: null }, score: 5, placesGained: 3 }),
      row({ app: { appleAppId: 'b', name: 'b', developer: null, iconUrl: null, rating: null, ratingCount: null }, score: 7 }),
      row({ app: { appleAppId: 'c', name: 'c', developer: null, iconUrl: null, rating: null, ratingCount: null }, score: 5, placesGained: 20 }),
      row({ app: { appleAppId: 'd', name: 'd', developer: null, iconUrl: null, rating: null, ratingCount: null }, score: 5, placesGained: null, currentRank: 1 }),
      row({ app: { appleAppId: 'e', name: 'e', developer: null, iconUrl: null, rating: null, ratingCount: null }, score: 5, placesGained: 3, currentRank: 2 }),
    ];
    expect(sortRadarApps(rows).map((r) => r.app!.appleAppId)).toEqual(['b', 'c', 'e', 'a', 'd']);
  });
});

describe('scope', () => {
  const charts = [chart('ph/7006/top-free', 'Casino'), chart('ph/7004/top-free', 'Board'),
    chart('us/7006/top-free', 'Casino'), chart('ph/7006/top-paid', 'Casino'), chart('jp/7006/top-free', 'Casino', false)];

  it('offers countries with an active chart, and each category once', () => {
    expect(radarCountries(charts)).toEqual(['ph', 'us']);
    expect(radarGenres(charts, 'ph')).toEqual([{ id: 7004, name: 'Board' }, { id: 7006, name: 'Casino' }]);
    expect(radarGenres(charts, 'jp')).toEqual([]);
  });
});

describe('themes', () => {
  it('normalise keywords like the backend', () => {
    expect(normalizeKeywords([' Lucky  9 ', 'lucky 9', '', 'SLOTS'])).toEqual(['lucky 9', 'slots']);
  });

  it('validate name and keywords', () => {
    expect(validateTheme('Sakura', ['sakura'])).toEqual({});
    expect(validateTheme(' ', [])).toEqual({ name: 'required', keywords: 'noKeyword' });
    expect(validateTheme('x'.repeat(61), ['!!'])).toEqual({ name: 'tooLong', keywords: 'keywordInvalid' });
    expect(validateTheme('Slots', ['slot'], ['slots'])).toEqual({ name: 'duplicate' });
    expect(validateTheme('Many', Array.from({ length: 21 }, (_, i) => `k${i}`))).toEqual({ keywords: 'tooManyKeywords' });
    expect(validateTheme('شطرنج', ['شطرنج'])).toEqual({});
  });

  it('turn an emerging word into a theme', () => {
    expect(themeFromWord('sakura')).toEqual({ name: 'Sakura', keywords: ['sakura'] });
  });
});
