import type { Chart, ChartType } from '@/api/types';

export interface ChartRef {
  country: string;
  genreId: number;
  type: ChartType;
}

const TYPE_SLUGS: Record<ChartType, string> = {
  TOP_FREE: 'top-free',
  TOP_PAID: 'top-paid',
  TOP_GROSSING: 'top-grossing',
};

export function chartTypeFromSlug(slug: string): ChartType | null {
  const found = (Object.entries(TYPE_SLUGS) as [ChartType, string][]).find(([, s]) => s === slug);
  return found ? found[0] : null;
}

/** "ph/7006/top-free" → { country: "ph", genreId: 7006, type: "TOP_FREE" } */
export function parseChartKey(key: string): ChartRef | null {
  const [country, genre, slug] = key.split('/');
  const type = slug ? chartTypeFromSlug(slug) : null;
  const genreId = Number(genre);
  if (!country || !type || !Number.isInteger(genreId)) return null;
  return { country, genreId, type };
}

export function chartKey(ref: ChartRef): string {
  return `${ref.country}/${ref.genreId}/${TYPE_SLUGS[ref.type]}`;
}

export const chartPath = (key: string) => `/charts/${key}`;

const WINDOW_MINUTES: Record<string, number> = { '1h': 60, '24h': 1440, '7d': 7 * 1440, '30d': 30 * 1440 };

/**
 * True when the backend compared with a reading later than the window start: the
 * chart is younger than the window, so the comparison covers a shorter period.
 */
export function isPartialWindow(asOf: string | null, windowAt: string | null, window: string): boolean {
  const minutes = WINDOW_MINUTES[window];
  if (!asOf || !windowAt || minutes === undefined) return false;
  return Date.parse(windowAt) > Date.parse(asOf) - minutes * 60_000;
}

/**
 * Chart to show when none is chosen: the remembered one if it is still
 * collected, otherwise the first collected chart with data, otherwise any.
 */
export function pickDefaultChart(charts: Chart[], remembered: string | null): Chart | undefined {
  const active = charts.filter((c) => c.active);
  return active.find((c) => c.key === remembered)
    ?? active.find((c) => c.asOf)
    ?? active[0]
    ?? charts.find((c) => c.key === remembered)
    ?? charts[0];
}

/**
 * Charts the chart picker offers: the collected ones, plus the current chart
 * so a link to a switched-off chart still shows its history.
 */
export function pickableCharts(charts: Chart[], current: Chart): Chart[] {
  return charts.filter((c) => c.active || c.key === current.key);
}
