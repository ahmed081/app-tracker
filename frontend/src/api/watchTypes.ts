// Shapes of the watchlist API (mirror of backend watch/WatchModel.java and AlertRule.java).
import type { AppCard, Chart, EventRow, Point, RankStatus } from './types';

export type WatchKind = 'APP' | 'CHART';
export type AlertPreset = 'IMPORTANT' | 'ALL' | 'CUSTOM';

/** eventTypes, minPlaces and tiers are set for CUSTOM only; tiers null = every configured tier. */
export interface AlertRule {
  preset: AlertPreset;
  eventTypes: string[] | null;
  minPlaces: number | null;
  tiers: number[] | null;
}

export interface Watch {
  id: number;
  kind: WatchKind;
  appleAppId: string | null;
  /** null for an app followed in all its charts. */
  chartKey: string | null;
  active: boolean;
  /** null for a chart watch (fixed big moments). */
  rule: AlertRule | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowRequest {
  kind: WatchKind;
  appleAppId?: string;
  chartKey?: string;
}

export interface WatchUpdate {
  active?: boolean;
  rule?: AlertRule;
}

/** A followed app in one chart. chart is null for an app followed in all charts that ranks nowhere now. */
export interface WatchedApp {
  watchId: number;
  allCharts: boolean;
  rule: AlertRule;
  chart: string | null;
  app: AppCard | null;
  currentRank: number | null;
  windowChange: number | null;
  /** OUT = not ranked in the latest reading. */
  windowStatus: RankStatus | 'OUT';
  trend: Point[];
  lastEvent: EventRow | null;
}

export interface WatchedChart {
  watchId: number;
  chart: Chart;
  numberOne: { app: AppCard; since: string | null } | null;
  lastKeyMove: EventRow | null;
}

export interface WatchlistResponse {
  window: string;
  asOf: string | null;
  apps: WatchedApp[];
  charts: WatchedChart[];
}
