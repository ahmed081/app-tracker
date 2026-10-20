import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { EventRow, Point } from '@/api/types';
import { eventMessage, eventTone } from '@/domain/events';
import { markerEvents, rankDomain, tierLines, timeTicks, withGaps, type HistoryDatum } from '@/domain/history';
import { useFormat } from '@/i18n/format';

export interface VersionMark {
  t: number;
  version: string;
}

interface RankHistoryChartProps {
  points: Point[];
  stepMinutes: number;
  events: EventRow[];
  versions: VersionMark[];
  height?: number;
}

function niceTicks([lo, hi]: [number, number]): number[] {
  const span = hi - lo;
  const step = span <= 10 ? 2 : span <= 25 ? 5 : span <= 60 ? 10 : 25;
  const ticks = new Set<number>([lo]);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) if (v >= 1) ticks.add(v);
  return [...ticks].sort((a, b) => a - b);
}

/**
 * The ranking history: one line, #1 at the top, a few tier guides, and markers
 * only for the events that change the story (entered Top 10, reached #1, left
 * the chart...). Breaks in the line mean the app was not ranked.
 */
export function RankHistoryChart({ points, stepMinutes, events, versions, height = 300 }: RankHistoryChartProps) {
  const { t } = useTranslation();
  const f = useFormat();

  const data: HistoryDatum[] = useMemo(() => withGaps(points, stepMinutes), [points, stepMinutes]);
  const domain = useMemo(() => rankDomain(data), [data]);
  const first = data[0]?.t ?? 0;
  const last = data[data.length - 1]?.t ?? 0;
  const markers = useMemo(() => markerEvents(events, first, last, stepMinutes), [events, first, last, stepMinutes]);
  const spanDays = (last - first) / 86_400_000;
  const tickLabel = (v: number) => (spanDays <= 2 ? f.time(v) : f.dayMonth(v));
  const shownVersions = versions.filter((v) => v.t >= first && v.t <= last);

  return (
    <div dir="ltr" style={{ height }} className="w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickLabel}
            ticks={timeTicks(first, last)} tickLine={false} axisLine={{ stroke: 'var(--line-strong)' }} tickMargin={8} />
          <YAxis reversed domain={domain} ticks={niceTicks(domain)} allowDecimals={false} tickFormatter={(v: number) => `#${v}`}
            tickLine={false} axisLine={false} width={44} tickMargin={6} />
          {tierLines(domain).map((tier) => (
            <ReferenceLine key={tier} y={tier} stroke="var(--ink-3)" strokeDasharray="3 4" strokeOpacity={0.6}
              label={{ value: t('chart.topN', { n: tier }), position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }} />
          ))}
          {shownVersions.map((v) => (
            <ReferenceLine key={`v-${v.t}`} x={v.t} stroke="var(--felt)" strokeOpacity={0.45} strokeDasharray="2 3"
              label={{ value: `v${v.version}`, position: 'insideBottomLeft', fill: 'var(--felt)', fontSize: 11 }} />
          ))}
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as HistoryDatum | undefined;
              if (!active || !d || d.rank == null) return null;
              const near = markers.find((m) => Math.abs(Date.parse(m.at) - d.t) <= stepMinutes * 60_000 / 2);
              const msg = near ? eventMessage(near) : null;
              return (
                <div dir={document.documentElement.dir} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
                  <p className="text-ink-3">{f.dateTime(d.t)}</p>
                  <p className="tnum text-[15px] font-semibold text-ink">{f.rank(d.rank)}</p>
                  {msg && <p className="mt-1 max-w-56 text-ink-2">{t(msg.key, { ...msg.values, app: t('events.thisApp') })}</p>}
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="rank" stroke="var(--series)" strokeWidth={2} dot={false} connectNulls={false}
            activeDot={{ r: 4, fill: 'var(--series)', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
          {markers.map((m) => {
            const tone = eventTone(m);
            return (
              // Exits below the visible range sit on the bottom edge instead of stretching the axis.
              <ReferenceDot key={m.id} x={Date.parse(m.at)} y={Math.min(Math.max(m.currentRank ?? domain[1], domain[0]), domain[1])} r={5}
                fill={tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--up)' : 'var(--ink-3)'}
                stroke="var(--surface)" strokeWidth={2} ifOverflow="visible" />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
