import { describe, expect, it } from 'vitest';
import type { Chart } from '@/api/types';
import type { Watch, WatchedApp, WatchlistResponse } from '@/api/watchTypes';
import { coveredByAllCharts, filterWatchlist, followRequest, lineTarget, ownWatch, watchlistCharts } from './watch';

const watch = (over: Partial<Watch>): Watch => ({
  id: 1, kind: 'APP', appleAppId: '42', chartKey: null, active: true,
  rule: { preset: 'IMPORTANT', eventTypes: null, minPlaces: null, tiers: null }, createdAt: '', updatedAt: '', ...over,
});
const line = (over: Partial<WatchedApp>): WatchedApp => ({
  watchId: 1, allCharts: false, rule: { preset: 'IMPORTANT', eventTypes: null, minPlaces: null, tiers: null },
  chart: 'ph/7006/top-free', app: { appleAppId: '42', name: 'A', developer: null, iconUrl: null, rating: null, ratingCount: null },
  currentRank: 3, windowChange: 1, windowStatus: 'UP', trend: [], lastEvent: null, ...over,
});
const CASINO = 'ph/7006/top-free';
const CARD = 'ph/7005/top-free';

describe('follow buttons', () => {
  it('find the watch of exactly their target', () => {
    const watches = [
      watch({ id: 1, chartKey: CASINO }),
      watch({ id: 2, chartKey: null }),
      watch({ id: 3, kind: 'CHART', appleAppId: null, chartKey: CASINO, rule: null }),
      watch({ id: 4, chartKey: CARD, active: false }),
    ];
    expect(ownWatch(watches, { kind: 'APP', appleAppId: '42', chartKey: CASINO })?.id).toBe(1);
    expect(ownWatch(watches, { kind: 'APP', appleAppId: '42' })?.id).toBe(2);
    expect(ownWatch(watches, { kind: 'CHART', chartKey: CASINO })?.id).toBe(3);
    expect(ownWatch(watches, { kind: 'APP', appleAppId: '42', chartKey: CARD })).toBeUndefined();   // switched off
    expect(ownWatch(watches, { kind: 'APP', appleAppId: '7', chartKey: CASINO })).toBeUndefined();
  });

  it('show an app followed in all charts as followed in each chart', () => {
    const all = [watch({ id: 2, chartKey: null })];
    expect(coveredByAllCharts(all, { kind: 'APP', appleAppId: '42', chartKey: CARD })).toBe(true);
    expect(coveredByAllCharts(all, { kind: 'APP', appleAppId: '42' })).toBe(false);                  // that is the watch itself
    expect(coveredByAllCharts([...all, watch({ id: 1, chartKey: CARD })], { kind: 'APP', appleAppId: '42', chartKey: CARD })).toBe(false);
  });

  it('send only what the target needs', () => {
    expect(followRequest({ kind: 'APP', appleAppId: '42', chartKey: null })).toEqual({ kind: 'APP', appleAppId: '42' });
    expect(followRequest({ kind: 'APP', appleAppId: '42', chartKey: CASINO })).toEqual({ kind: 'APP', appleAppId: '42', chartKey: CASINO });
    expect(followRequest({ kind: 'CHART', chartKey: CASINO })).toEqual({ kind: 'CHART', chartKey: CASINO });
  });
});

describe('watchlist page', () => {
  const chart = { key: CARD } as Chart;
  const data: WatchlistResponse = {
    window: '24h', asOf: null,
    apps: [line({ chart: CASINO }), line({ watchId: 2, allCharts: true, chart: CARD }), line({ watchId: 3, allCharts: true, chart: null })],
    charts: [{ watchId: 4, chart, numberOne: null, lastKeyMove: null }],
  };

  it('offers each chart once and filters by it', () => {
    expect(watchlistCharts(data)).toEqual([CASINO, CARD]);
    const card = filterWatchlist(data, CARD);
    expect(card.apps.map((a) => a.watchId)).toEqual([2]);
    expect(card.charts).toHaveLength(1);
    expect(filterWatchlist(data, 'all')).toBe(data);
  });

  it('unfollows a line through its own watch', () => {
    expect(lineTarget(line({ chart: CASINO }))).toEqual({ kind: 'APP', appleAppId: '42', chartKey: CASINO });
    expect(lineTarget(line({ allCharts: true, chart: CASINO }))).toEqual({ kind: 'APP', appleAppId: '42', chartKey: null });
    expect(lineTarget(line({ app: null }))).toBeNull();
  });
});
