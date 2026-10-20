// Shapes of the Settings API /api/manage (mirror of backend ManageModel.java and EventRules.java).
// Timestamps are ISO-8601 strings in UTC.
import type { ChartType } from './types';

export interface ManagedCountry {
  code: string;                // "ph"
  name: string;
  enabled: boolean;
  activeCharts: number;        // charts collected in this country right now
}

export interface ManagedGenre {
  id: number;
  name: string;
  parentId: number | null;
  enabled: boolean;
  availableOnApple: boolean;   // set by the collector's genre sync only
}

export interface TrackingCountry {
  code: string;
  active: boolean;
}

export interface Tracking {
  id: number;
  genreId: number;
  genreName: string;
  chartType: ChartType;
  depth: number;
  intervalMinutes: number;
  allCountries: boolean;
  active: boolean;
  countries: TrackingCountry[];
  targetCharts: number;        // charts this row produces right now
}

export interface EventRules {
  tiers: number[];
  bigMovePlaces: number;
  risingHours: number;         // period examined by the rising rule
  risingGainPercent: number;   // share of the readings in it that must be gains
  risingMinNetPlaces: number;
  newBestAfterDays: number;
}

export interface RulesResponse {
  rules: EventRules;
  defaults: EventRules;
  custom: boolean;             // false = application.yml defaults
  updatedAt: string | null;
  tierChoices: number[];
}

export type SnapshotStatus = 'VALID' | 'INCOMPLETE' | 'FAILED';

export interface ChartStatus {
  key: string;
  country: string;
  countryName: string;
  genreId: number;
  genreName: string;
  chartType: ChartType;
  active: boolean;
  intervalMinutes: number;
  lastAttemptAt: string | null;
  lastValidReadingAt: string | null;
  lastSlot: string | null;
  lastStatus: SnapshotStatus | null;
  lastReasons: string | null;   // e.g. "below_min_entries:12" or "fetch_error:HTTP 503"
  lastEntryCount: number | null;
  delayed: boolean;
  pendingSnapshots: number;
}

export interface RebuildState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  chartsDone: number;
  chartsTotal: number;
  snapshotsProcessed: number;
  error: string | null;
}

export interface StatusResponse {
  now: string;
  adminKeyRequired: boolean;
  collector: { targetCharts: number; lastAttemptAt: string | null; lastValidReadingAt: string | null };
  events: { pendingSnapshots: number; lastProcessedAt: string | null };
  rebuild: RebuildState;
  charts: ChartStatus[];
}

export interface CountryCreate {
  code: string;
  name: string;
  enabled: boolean;
}

export interface TrackingCreate {
  genreId: number;
  chartType: ChartType;
  depth: number;
  intervalMinutes: number;
  allCountries: boolean;
  active: boolean;
  countries: string[];
}

export interface TrackingUpdate {
  depth?: number;
  intervalMinutes?: number;
  allCountries?: boolean;
  active?: boolean;
}

export interface MetadataRunSummary {
  apps: number;
  found: number;
  notFound: number;
  failedCalls: number;
}
