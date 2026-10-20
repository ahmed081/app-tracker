import type { Point } from '@/api/types';

/**
 * Tiny rank trend for table rows. #1 is at the top, so a rising line means
 * a climbing app. Decorative: the numbers next to it carry the information.
 */
export function Sparkline({ points, width = 88, height = 26 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <span aria-hidden className="inline-block" style={{ width, height }} />;
  const ranks = points.map((p) => p.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = Math.max(max - min, 4);            // flat-ish lines stay flat
  const pad = 3;
  const t0 = Date.parse(points[0]!.t);
  const t1 = Date.parse(points[points.length - 1]!.t);
  const x = (t: string) => pad + ((Date.parse(t) - t0) / Math.max(t1 - t0, 1)) * (width - 2 * pad);
  const y = (r: number) => pad + ((r - min) / span) * (height - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.rank).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" style={{ direction: 'ltr' }}>
      <path d={d} fill="none" stroke="var(--series)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.rank)} r={2.5} fill="var(--series)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
