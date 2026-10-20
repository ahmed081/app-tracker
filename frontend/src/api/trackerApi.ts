// The only module that knows the backend's URLs. Everything else calls these functions.
import { getJson } from './http';
import type {
  AppResponse, BumpResponse, Chart, EventRow, EventsResponse, HeadlinesResponse, HistoryResponse,
  MoversResponse, RankingResponse, RatingPoint, SearchResult, VersionsResponse,
} from './types';

/** "ph/7006/top-free" → "/api/charts/ph/7006/top-free" */
const chartPath = (chartKey: string) => `/api/charts/${chartKey}`;
const appPath = (appleAppId: string) => `/api/apps/${encodeURIComponent(appleAppId)}`;

export const trackerApi = {
  charts: (_p: Record<string, never>, signal?: AbortSignal) => getJson<Chart[]>('/api/charts', {}, signal),

  ranking: (p: { chartKey: string; window: string; limit: number }, signal?: AbortSignal) =>
    getJson<RankingResponse>(`${chartPath(p.chartKey)}/ranking`, { window: p.window, limit: p.limit }, signal),

  headlines: (p: { chartKey: string; window: string }, signal?: AbortSignal) =>
    getJson<HeadlinesResponse>(`${chartPath(p.chartKey)}/headlines`, { window: p.window }, signal),

  /** depth: 25 = moves in and out of the Top 25; 200 = the whole chart. */
  movers: (p: { chartKey: string; window: string; minPlaces: number; depth?: number; limit?: number }, signal?: AbortSignal) =>
    getJson<MoversResponse>(`${chartPath(p.chartKey)}/movers`,
      { window: p.window, minPlaces: p.minPlaces, depth: p.depth, limit: p.limit }, signal),

  chartEvents: (p: { chartKey: string; minImportance: number; since?: string; limit: number }, signal?: AbortSignal) =>
    getJson<EventsResponse>(`${chartPath(p.chartKey)}/events`,
      { minImportance: p.minImportance, since: p.since, limit: p.limit }, signal),

  bump: (p: { chartKey: string; window: string; top: number; stepMinutes?: number }, signal?: AbortSignal) =>
    getJson<BumpResponse>(`${chartPath(p.chartKey)}/bump`,
      { window: p.window, top: p.top, stepMinutes: p.stepMinutes }, signal),

  app: (p: { appleAppId: string }, signal?: AbortSignal) => getJson<AppResponse>(appPath(p.appleAppId), {}, signal),

  appHistory: (p: { appleAppId: string; chartKey: string; range: string }, signal?: AbortSignal) =>
    getJson<HistoryResponse>(`${appPath(p.appleAppId)}/history`, { chart: p.chartKey, range: p.range }, signal),

  appEvents: (p: { appleAppId: string; range: string; minImportance: number }, signal?: AbortSignal) =>
    getJson<EventRow[]>(`${appPath(p.appleAppId)}/events`, { range: p.range, minImportance: p.minImportance }, signal),

  appVersions: (p: { appleAppId: string }, signal?: AbortSignal) =>
    getJson<VersionsResponse>(`${appPath(p.appleAppId)}/versions`, {}, signal),

  appRatings: (p: { appleAppId: string; range: string }, signal?: AbortSignal) =>
    getJson<RatingPoint[]>(`${appPath(p.appleAppId)}/ratings`, { range: p.range }, signal),

  search: (p: { q: string }, signal?: AbortSignal) => getJson<SearchResult[]>('/api/search', { q: p.q }, signal),
};

export type TrackerApi = typeof trackerApi;
