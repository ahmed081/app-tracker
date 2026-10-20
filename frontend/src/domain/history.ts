// Turning a rank history into something readable in a few seconds.
import type { EventRow, Point } from '@/api/types';

export interface HistoryDatum {
  t: number;                 // epoch ms
  rank: number | null;       // null breaks the line: not ranked during that period
}

/**
 * Points come only for periods where the app was ranked. A hole longer than
 * 3 steps means it dropped out of the chart (or collection stopped): insert a
 * null so the line breaks there instead of drawing a misleading straight
 * segment. Shorter holes (a missed reading) are bridged. The API never uses a
 * step shorter than the chart's interval, so one step is at least one reading.
 */
export function withGaps(points: Point[], stepMinutes: number): HistoryDatum[] {
  const step = stepMinutes * 60_000;
  const out: HistoryDatum[] = [];
  let prev: number | null = null;
  for (const p of points) {
    const t = Date.parse(p.t);
    if (prev !== null && t - prev > step * 3) out.push({ t: prev + step, rank: null });
    out.push({ t, rank: p.rank });
    prev = t;
  }
  return out;
}

/** Indexes of ranked points with no ranked neighbour: a line can't show them, so they get a dot. */
export function isolatedPoints(data: HistoryDatum[]): Set<number> {
  const out = new Set<number>();
  data.forEach((d, i) => {
    if (d.rank !== null && data[i - 1]?.rank == null && data[i + 1]?.rank == null) out.add(i);
  });
  return out;
}

export interface HistorySummary {
  first: Point;
  last: Point;
  best: Point;
  worst: Point;
  /** Places gained from the first to the last point (positive = up). */
  change: number;
}

export function summarize(points: Point[]): HistorySummary | null {
  const [first] = points;
  const last = points[points.length - 1];
  if (!first || !last) return null;
  let best = first;
  let worst = first;
  for (const p of points) {
    if (p.rank < best.rank) best = p;
    if (p.rank > worst.rank) worst = p;
  }
  return { first, last, best, worst, change: first.rank - last.rank };
}

/**
 * Y range for a rank chart (#1 at the top): pad around the data and snap to
 * round numbers, but never start below #1. Showing 1..100 for an app that
 * moved between #2 and #8 would flatten the story.
 */
export function rankDomain(points: { rank: number | null }[]): [number, number] {
  const ranks = points.map((p) => p.rank).filter((r): r is number => r !== null);
  if (ranks.length === 0) return [1, 25];
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const pad = Math.max(2, Math.ceil((max - min) * 0.15));
  const step = max + pad > 50 ? 10 : 5;
  const lo = Math.max(1, Math.floor((min - pad) / step) * step);
  const hi = Math.ceil((max + pad) / step) * step;
  return [lo === 0 ? 1 : lo, Math.max(hi, lo + step)];
}

/** Tier reference lines worth drawing inside a rank domain. */
export function tierLines(domain: [number, number]): number[] {
  return [10, 25].filter((t) => t > domain[0] && t < domain[1]);
}

/**
 * X-axis ticks on whole days (local midnight), or every 6 hours for short
 * ranges, thinned to at most `max` ticks so labels never repeat or collide.
 */
export function timeTicks(from: number, to: number, max = 8): number[] {
  if (to <= from) return [from];
  const hour = 3_600_000;
  const day = 24 * hour;
  const span = to - from;
  const unit = span <= 2 * day ? 6 * hour : day;
  const start = new Date(from);
  if (unit === day) start.setHours(24, 0, 0, 0);
  else start.setHours(Math.ceil((start.getHours() + start.getMinutes() / 60) / 6) * 6, 0, 0, 0);
  const all: number[] = [];
  for (let t = start.getTime(); t <= to; t += unit) {
    all.push(t);
    if (unit === day) {
      // Re-snap to midnight after daylight-saving changes.
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      t = d.getTime();
    }
  }
  const stride = Math.ceil(all.length / max);
  return all.filter((_, i) => i % stride === 0);
}

/** Events kept in an app's "key changes" list (the Rising badge covers rising). */
export const KEY_CHANGE_TYPES = new Set(['REACHED_NUMBER_ONE', 'LOST_NUMBER_ONE', 'ENTERED_TOP_N', 'LEFT_TOP_N',
  'NEW_ENTRY', 'RE_ENTRY', 'LEFT_CHART', 'BIG_MOVE']);

export const MARKER_TYPES = new Set(['REACHED_NUMBER_ONE', 'ENTERED_TOP_N', 'LEFT_TOP_N', 'NEW_ENTRY', 'RE_ENTRY', 'LEFT_CHART']);

/**
 * Events drawn on the history graph. Only the few that change the story, and at
 * most one per time bucket, so the chart stays quiet.
 */
export function markerEvents(events: EventRow[], from: number, to: number, stepMinutes: number, max = 8): EventRow[] {
  const bucket = stepMinutes * 60_000 * 3;
  const chosen: EventRow[] = [];
  const sorted = events
    .filter((e) => MARKER_TYPES.has(e.type) && e.importance >= 2)
    .filter((e) => {
      const t = Date.parse(e.at);
      return t >= from && t <= to;
    })
    .sort((a, b) => b.importance - a.importance || Date.parse(b.at) - Date.parse(a.at));
  for (const e of sorted) {
    const t = Date.parse(e.at);
    if (chosen.some((c) => Math.abs(Date.parse(c.at) - t) < bucket)) continue;
    chosen.push(e);
    if (chosen.length >= max) break;
  }
  return chosen.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
