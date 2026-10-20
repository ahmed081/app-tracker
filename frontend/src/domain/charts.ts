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

/**
 * Chart to show when none is chosen: the remembered one if it still exists,
 * otherwise the first chart with data, otherwise the first chart.
 */
export function pickDefaultChart(charts: Chart[], remembered: string | null): Chart | undefined {
  return charts.find((c) => c.key === remembered)
    ?? charts.find((c) => c.active && c.asOf)
    ?? charts[0];
}
