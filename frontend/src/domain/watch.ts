// Watchlist rules shared by the Follow buttons and the watchlist page.
import type { FollowRequest, Watch, WatchedApp, WatchlistResponse } from '@/api/watchTypes';

/** What a Follow button follows: an app in one chart, an app in all its charts (no chartKey), or a chart. */
export type FollowTarget =
  | { kind: 'APP'; appleAppId: string; chartKey?: string | null }
  | { kind: 'CHART'; chartKey: string };

export function followRequest(target: FollowTarget): FollowRequest {
  if (target.kind === 'CHART') return { kind: 'CHART', chartKey: target.chartKey };
  return target.chartKey ? { kind: 'APP', appleAppId: target.appleAppId, chartKey: target.chartKey }
    : { kind: 'APP', appleAppId: target.appleAppId };
}

/** Stable id of a target, for its saving state. */
export function targetId(target: FollowTarget): string {
  return target.kind === 'CHART' ? `CHART:${target.chartKey}` : `APP:${target.appleAppId}:${target.chartKey ?? '*'}`;
}

/** The active watch of exactly this target, if any. */
export function ownWatch(watches: readonly Watch[], target: FollowTarget): Watch | undefined {
  return watches.find((w) => w.active && w.kind === target.kind
    && (target.kind === 'CHART' || w.appleAppId === target.appleAppId)
    && w.chartKey === (target.chartKey ?? null));
}

/**
 * True when an app in a chart is followed only through "all charts": the
 * chart's button shows it followed, but unfollowing is done on that watch.
 */
export function coveredByAllCharts(watches: readonly Watch[], target: FollowTarget): boolean {
  if (target.kind !== 'APP' || !target.chartKey || ownWatch(watches, target)) return false;
  return ownWatch(watches, { kind: 'APP', appleAppId: target.appleAppId }) !== undefined;
}

/** The target a watchlist line unfollows: its own watch, in one chart or in all charts. */
export function lineTarget(line: WatchedApp): FollowTarget | null {
  if (!line.app) return null;
  return { kind: 'APP', appleAppId: line.app.appleAppId, chartKey: line.allCharts ? null : line.chart };
}

/** Charts the watchlist can be filtered by: every chart with a line or a card, in first-seen order. */
export function watchlistCharts(data: WatchlistResponse): string[] {
  const keys = [...data.apps.map((a) => a.chart), ...data.charts.map((c) => c.chart.key)];
  return [...new Set(keys.filter((k): k is string => k !== null))];
}

/** Lines and cards of one chart ('all' = everything; app lines ranked nowhere stay under 'all' only). */
export function filterWatchlist(data: WatchlistResponse, chartKey: string): WatchlistResponse {
  if (chartKey === 'all') return data;
  return { ...data, apps: data.apps.filter((a) => a.chart === chartKey), charts: data.charts.filter((c) => c.chart.key === chartKey) };
}
