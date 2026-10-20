import { describe, expect, it } from 'vitest';
import type { EventRow } from '@/api/types';
import { chartKey, parseChartKey, pickDefaultChart } from './charts';
import { eventMessage, eventTone } from './events';
import { markerEvents, rankDomain, summarize, tierLines, timeTicks, withGaps } from './history';
import { direction, isNoise, placesGained, tierOf } from './rank';

const ev = (over: Partial<EventRow>): EventRow => ({
  id: 1, at: '2026-10-18T10:00:00Z', chart: 'ph/7006/top-free', app: null, type: 'MOVED_UP', tier: null,
  previousRank: 5, currentRank: 3, importance: 1, primary: true, coveredMinutes: 60, gap: false, text: '', ...over,
});

describe('rank', () => {
  it('reads changes as places gained', () => {
    expect(placesGained(10, 4)).toBe(6);
    expect(placesGained(3, 11)).toBe(-8);
    expect(placesGained(null, 4)).toBeNull();
    expect(direction(6)).toBe('up');
    expect(direction(-8)).toBe('down');
    expect(direction(0)).toBe('same');
    expect(direction(null)).toBe('none');
    expect(direction(null, true)).toBe('new');
  });

  it('finds the best tier', () => {
    expect(tierOf(1)).toBe(1);
    expect(tierOf(3)).toBe(5);
    expect(tierOf(8)).toBe(10);
    expect(tierOf(25)).toBe(25);
    expect(tierOf(26)).toBeNull();
  });

  it('treats small moves as noise', () => {
    expect(isNoise(2, 3)).toBe(true);
    expect(isNoise(-3, 3)).toBe(false);
    expect(isNoise(0, 3)).toBe(false);
  });
});

describe('charts', () => {
  it('round-trips chart keys', () => {
    expect(parseChartKey('ph/7006/top-free')).toEqual({ country: 'ph', genreId: 7006, type: 'TOP_FREE' });
    expect(chartKey({ country: 'us', genreId: 6014, type: 'TOP_GROSSING' })).toBe('us/6014/top-grossing');
    expect(parseChartKey('ph/abc/top-free')).toBeNull();
    expect(parseChartKey('ph/7006/top-weird')).toBeNull();
  });

  it('picks the remembered chart, else the first with data', () => {
    const c = (key: string, asOf: string | null) => ({ key, asOf, active: true }) as never;
    const charts = [c('ph/7004/top-free', null), c('ph/7006/top-free', '2026-10-19T09:00:00Z')];
    expect(pickDefaultChart(charts, 'ph/7004/top-free')).toBe(charts[0]);
    expect(pickDefaultChart(charts, 'xx/1/top-free')).toBe(charts[1]);
    expect(pickDefaultChart(charts, null)).toBe(charts[1]);
  });
});

describe('history', () => {
  const pt = (h: number, rank: number) => ({ t: new Date(Date.UTC(2026, 9, 18, h)).toISOString(), rank });

  it('breaks the line only for long holes', () => {
    const data = withGaps([pt(0, 5), pt(1, 4), pt(3, 4), pt(8, 6)], 60);
    expect(data.map((d) => d.rank)).toEqual([5, 4, 4, null, 6]);   // 2h hole bridged, 5h hole broken
  });

  it('summarises a period', () => {
    const s = summarize([pt(0, 82), pt(1, 40), pt(2, 2), pt(3, 3)])!;
    expect(s.change).toBe(79);
    expect(s.best.rank).toBe(2);
    expect(s.worst.rank).toBe(82);
    expect(summarize([])).toBeNull();
  });

  it('zooms the rank axis on the data, never above #1', () => {
    expect(rankDomain([{ rank: 2 }, { rank: 8 }])).toEqual([1, 10]);
    const [lo, hi] = rankDomain([{ rank: 40 }, { rank: 60 }]);
    expect(lo).toBeLessThanOrEqual(40);
    expect(hi).toBeGreaterThanOrEqual(60);
    expect(rankDomain([])).toEqual([1, 25]);
    expect(tierLines([1, 100])).toEqual([10, 25]);
    expect(tierLines([30, 60])).toEqual([]);
  });

  it('puts day ticks on distinct days, at most 8', () => {
    const from = Date.UTC(2026, 9, 9, 10);
    const ticks = timeTicks(from, from + 10 * 86_400_000);
    expect(ticks.length).toBeLessThanOrEqual(8);
    const days = ticks.map((t) => new Date(t).toDateString());
    expect(new Set(days).size).toBe(days.length);
  });

  it('keeps only a few important markers, one per bucket', () => {
    const events = [
      ev({ id: 1, type: 'ENTERED_TOP_N', tier: 10, importance: 3, at: '2026-10-18T10:00:00Z' }),
      ev({ id: 2, type: 'ENTERED_TOP_N', tier: 5, importance: 3, at: '2026-10-18T10:00:00Z' }),
      ev({ id: 3, type: 'MOVED_UP', importance: 1, at: '2026-10-18T14:00:00Z' }),
      ev({ id: 4, type: 'LEFT_CHART', importance: 2, at: '2026-10-19T02:00:00Z' }),
    ];
    const m = markerEvents(events, Date.UTC(2026, 9, 17), Date.UTC(2026, 9, 20), 60);
    expect(m.map((e) => e.id)).toEqual([1, 4]);
  });
});

describe('events', () => {
  it('chooses a sentence that never shows an empty rank', () => {
    expect(eventMessage(ev({ type: 'REACHED_NUMBER_ONE', previousRank: null, currentRank: 1 })).key).toBe('event.REACHED_NUMBER_ONE_NEW');
    expect(eventMessage(ev({ type: 'ENTERED_TOP_N', previousRank: null, currentRank: 3 })).key).toBe('event.ENTERED_TOP_N_NEW');
    expect(eventMessage(ev({ type: 'LEFT_CHART', currentRank: 31 })).key).toBe('event.LEFT_CHART_TO');
    expect(eventMessage(ev({ type: 'LEFT_CHART', currentRank: null })).key).toBe('event.LEFT_CHART');
    expect(eventMessage(ev({ type: 'BIG_MOVE', previousRank: 30, currentRank: 12 })).key).toBe('event.BIG_MOVE_UP');
    expect(eventMessage(ev({ type: 'LEFT_TOP_N', currentRank: null })).key).toBe('event.LEFT_TOP_N_OUT');
  });

  it('gives each event a direction', () => {
    expect(eventTone(ev({ type: 'ENTERED_TOP_N' }))).toBe('up');
    expect(eventTone(ev({ type: 'LEFT_CHART' }))).toBe('down');
    expect(eventTone(ev({ type: 'BIG_MOVE', previousRank: 4, currentRank: 19 }))).toBe('down');
    expect(eventTone(ev({ type: 'RISING_ENDED' }))).toBe('neutral');
  });
});
