// Response shapes of the backend API (mirror of backend ApiModel.java).
// Timestamps are ISO-8601 strings in UTC.

export type ChartType = 'TOP_FREE' | 'TOP_PAID' | 'TOP_GROSSING';
export type RankStatus = 'NEW' | 'UP' | 'DOWN' | 'SAME' | 'NO_DATA';
export type Badge = 'NUMBER_ONE' | 'TOP_5' | 'TOP_10' | 'NEW_ENTRY' | 'RE_ENTRY' | 'NEW_BEST' | (string & {});
export type EventType =
  | 'REACHED_NUMBER_ONE' | 'LOST_NUMBER_ONE' | 'ENTERED_TOP_N' | 'LEFT_TOP_N'
  | 'NEW_ENTRY' | 'RE_ENTRY' | 'LEFT_CHART' | 'NEW_BEST' | 'BIG_MOVE'
  | 'RISING_STARTED' | 'RISING_ENDED' | 'MOVED_UP' | 'MOVED_DOWN' | 'FIRST_OBSERVED';

export interface Chart {
  key: string;                 // e.g. "ph/7006/top-free"
  country: string;
  countryName: string;
  genreId: number;
  genreName: string;
  chartType: ChartType;
  active: boolean;
  intervalMinutes: number;
  asOf: string | null;
  lastValidReadingAt: string | null;
  lastAttemptAt: string | null;
  delayed: boolean;
}

export interface AppCard {
  appleAppId: string;
  name: string;
  developer: string | null;
  iconUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
}

export interface Point {
  t: string;
  rank: number;
}

export interface RankingRow {
  rank: number;
  app: AppCard;
  previousRank: number | null;
  change: number | null;
  status: RankStatus;
  windowRank: number | null;
  windowChange: number | null;
  windowStatus: RankStatus;
  badges: Badge[];
  rising: boolean;
  trend: Point[];
}

export interface LeftRow {
  app: AppCard;
  previousRank: number;
  currentRank: number | null;
}

export interface RankingResponse {
  chart: Chart;
  asOf: string | null;
  previousAt: string | null;
  window: string;
  windowAt: string | null;
  rows: RankingRow[];
  leftChart: LeftRow[];
}

export interface Mover {
  app: AppCard;
  fromRank: number | null;
  toRank: number | null;
  change: number | null;
}

export interface EventRow {
  id: number;
  at: string;
  chart: string;
  app: AppCard | null;
  type: EventType;
  tier: number | null;
  previousRank: number | null;
  currentRank: number | null;
  importance: 0 | 1 | 2 | 3;
  primary: boolean;
  coveredMinutes: number | null;
  gap: boolean;
  text: string;
}

export interface MoversResponse {
  chart: Chart;
  asOf: string | null;
  window: string;
  windowAt: string | null;
  climbers: Mover[];
  fallers: Mover[];
  newEntries: Mover[];
  leftChart: Mover[];
  rising: Mover[];
  tierCrossings: EventRow[];
}

export interface HeadlinesResponse {
  chart: Chart;
  asOf: string | null;
  window: string;
  numberOne: { app: AppCard; since: string | null } | null;
  newNumberOne: EventRow[];
  enteredTop10: EventRow[];
  biggestClimber: Mover | null;
  biggestDrop: Mover | null;
  newEntries: EventRow[];
  quiet: boolean;
}

export interface EventsResponse {
  chart: Chart;
  events: EventRow[];
}

export interface BumpResponse {
  chart: Chart;
  window: string;
  stepMinutes: number;
  series: { app: AppCard; points: Point[] }[];
}

export interface ChartPerformance {
  chart: string;
  asOf: string | null;
  currentRank: number | null;
  inChart: boolean;
  change24h: number | null;
  change7d: number | null;
  bestRank: number | null;
  bestRankAt: string | null;
  worstRank: number | null;
  firstObservedAt: string | null;
  inChartSince: string | null;
  rising: boolean;
  averageRank30d: number | null;
  hoursInTier: Record<string, number>;   // "number_one", "top_5", "top_10", "top_25"
}

export interface CountryListing {
  country: string;
  name: string | null;
  developer: string | null;
  description: string | null;
  iconUrl: string | null;
  storeUrl: string | null;
  price: number | null;
  currency: string | null;
  ageRating: string | null;
  version: string | null;
  versionReleasedAt: string | null;
  releaseNotes: string | null;
  sizeBytes: number | null;
  languages: string | null;
  screenshotUrls: string[];
  rating: number | null;
  ratingCount: number | null;
  detailsStatus: 'OK' | 'NOT_FOUND' | 'ERROR' | null;
  detailsCheckedAt: string | null;
}

export interface AppResponse {
  appleAppId: string;
  bundleId: string | null;
  developer: string | null;
  developerAppleId: string | null;
  releaseDate: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  listings: CountryListing[];
  charts: ChartPerformance[];
}

export interface HistoryResponse {
  appleAppId: string;
  chart: string;
  range: string;
  stepMinutes: number;
  points: Point[];
}

export interface VersionsResponse {
  appleAppId: string;
  listings: { country: string; name: string; title: string | null; price: number | null; currency: string | null;
    iconUrl: string | null; firstSeenAt: string; lastSeenAt: string }[];
  details: { country: string; name: string; version: string | null; versionReleasedAt: string | null;
    releaseNotes: string | null; sizeBytes: number | null; firstSeenAt: string; lastSeenAt: string }[];
}

export interface RatingPoint {
  country: string;
  day: string;
  rating: number | null;
  ratingCount: number | null;
}

export interface SearchResult {
  app: AppCard;
  charts: { chart: string; rank: number }[];
}
