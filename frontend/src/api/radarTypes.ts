// Shapes of the Radar API (mirror of backend radar/RadarModel.java).
import type { AppCard, Point } from './types';

/** Why an app is on the Radar (backend radar/Reason.java). */
export type RadarReason =
  | 'NEW_APP' | 'NEW_IN_CHARTS' | 'CLIMBING' | 'STEADY' | 'RATINGS_GROWING'
  | 'RATINGS_FAST' | 'UNKNOWN_THEME' | 'HAS_FOLLOWERS' | 'MULTI_COUNTRY' | 'NEW_DEVELOPER';

/**
 * SHORT_HISTORY: less than 7 days of data. BASELINE_SHORT: less than the period plus the
 * 60-day baseline. ONLY_ONE_COUNTRY: nothing to compare abroad. NO_CHARTS: nothing tracked here.
 */
export type RadarNote = 'SHORT_HISTORY' | 'BASELINE_SHORT' | 'ONLY_ONE_COUNTRY' | 'NO_CHARTS';

/** An app in one chart of the scope (Newcomers, Rising from the bottom). */
export interface RadarApp {
  app: AppCard | null;
  chart: string;
  currentRank: number | null;
  /** Rank at the start of the period; null = not ranked then. */
  startRank: number | null;
  /** Places gained over the period; null when not ranked now. */
  placesGained: number | null;
  /** Ratings gained over 7 days; null without enough daily data. */
  ratingsGained: number | null;
  ratingsGrowthPercent: number | null;
  /** Days since Apple's release date. */
  ageDays: number | null;
  /** First appearance in the scope's charts. */
  firstSeenAt: string | null;
  reasons: RadarReason[];
  score: number;
  dismissed: boolean;
  trend: Point[];
}

/** An emerging word, or a word seen abroad but not here yet. Apps: earliest first. */
export interface RadarWord {
  word: string;
  appCount: number;
  developerCount: number;
  firstSeenAt: string | null;
  apps: AppCard[];
}

export interface RadarCluster {
  originator: AppCard | null;
  /** Chart of the originator's trend; null when it ranks nowhere now. */
  chart: string | null;
  originatorFirstSeenAt: string;
  trend: Point[];
  followers: AppCard[];
  /** The rare word they share; null when only the names are close. */
  word: string | null;
  placesGained: number;
  ratingsGained: number | null;
  countries: number;
  dismissed: boolean;
}

export interface AbroadRank {
  chart: string;
  country: string;
  rank: number;
  /** In that chart's Top 25 since; null = since tracking began. */
  since: string | null;
}

export interface RadarAbroad {
  app: AppCard | null;
  ranks: AbroadRank[];
  countries: string[];
  dismissed: boolean;
}

export interface RadarResponse {
  country: string;
  genreId: number | null;
  window: string;
  asOf: string | null;
  /** The scope's first VALID reading. */
  dataSince: string | null;
  hideKnown: boolean;
  minScore: number;
  /** App rows left out because their score is below minScore. */
  hiddenByScore: number;
  newcomers: RadarApp[];
  risingFromBottom: RadarApp[];
  emergingWords: RadarWord[];
  clusters: RadarCluster[];
  abroad: RadarAbroad[];
  abroadWords: RadarWord[];
  notes: RadarNote[];
}

export interface RadarParams {
  country: string;
  /** Omitted = every tracked category of the country. */
  genre?: number;
  window: string;
  hideKnown: boolean;
  showDismissed: boolean;
  minScore: number;
}

export interface RadarTheme {
  id: number;
  name: string;
  keywords: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Create: name and keywords. Change: any of the three. */
export interface ThemeRequest {
  name?: string;
  keywords?: string[];
  active?: boolean;
}

export interface Dismissal {
  appleAppId: string;
  active: boolean;
}
