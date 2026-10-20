import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppCard, Point } from '@/api/types';
import { useFormat } from '@/i18n/format';
import { timeTicks } from '@/domain/history';
import { cn } from '@/components/ui/cn';

export const MAX_SERIES = 8;   // the categorical palette has 8 validated colours

interface BumpChartProps {
  series: { app: AppCard; points: Point[] }[];
  height?: number;
}

/**
 * How the current top apps reached their positions: one line per app, #1 at
 * the top. Hovering a legend entry highlights its line.
 */
export function BumpChart({ series, height = 340 }: BumpChartProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const [focus, setFocus] = useState<string | null>(null);
  const shown = series.slice(0, MAX_SERIES);

  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const s of shown) {
      for (const p of s.points) {
        const tms = Date.parse(p.t);
        const row = rows.get(tms) ?? { t: tms };
        row[s.app.appleAppId] = p.rank;
        rows.set(tms, row);
      }
    }
    return [...rows.values()].sort((a, b) => a.t! - b.t!);
  }, [shown]);

  // Show positions #1–#25: the chart is about the race at the top. Apps
  // coming from further down enter through the bottom edge.
  const DEPTH = 25;
  const first = (data[0]?.t as number | undefined) ?? 0;
  const last = (data[data.length - 1]?.t as number | undefined) ?? 0;
  const colour = (i: number) => `var(--cat-${i + 1})`;

  return (
    <div>
      <div dir="ltr" style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => f.dayMonth(v)}
              ticks={timeTicks(first, last)} tickLine={false} axisLine={{ stroke: 'var(--line-strong)' }} tickMargin={8} />
            <YAxis reversed domain={[1, DEPTH]} allowDataOverflow ticks={[1, 5, 10, 15, 20, 25]} allowDecimals={false}
              tickFormatter={(v: number) => `#${v}`} tickLine={false} axisLine={false} width={44} />
            <Tooltip isAnimationActive={false} cursor={{ stroke: 'var(--line-strong)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const items = [...payload].filter((p) => typeof p.value === 'number').sort((a, b) => Number(a.value) - Number(b.value));
                return (
                  <div dir={document.documentElement.dir} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
                    <p className="mb-1 text-ink-3">{f.dateTime(Number(label))}</p>
                    {items.map((p) => {
                      const s = shown.find((x) => x.app.appleAppId === p.dataKey);
                      return (
                        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
                          <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.stroke }} />
                          <span className="tnum w-8 text-ink-2">{f.rank(Number(p.value))}</span>
                          <span className="max-w-48 truncate">{s?.app.name}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }} />
            {shown.map((s, i) => (
              <Line key={s.app.appleAppId} dataKey={s.app.appleAppId} name={s.app.name} type="linear" stroke={colour(i)}
                strokeWidth={focus === s.app.appleAppId ? 3 : 2} strokeOpacity={focus && focus !== s.app.appleAppId ? 0.15 : 1}
                dot={false} connectNulls={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label={t('bump.legend')}>
        {shown.map((s, i) => (
          <li key={s.app.appleAppId}>
            <button type="button" onMouseEnter={() => setFocus(s.app.appleAppId)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(s.app.appleAppId)} onBlur={() => setFocus(null)}
              className={cn('flex items-center gap-1.5 text-[12.5px]', focus && focus !== s.app.appleAppId ? 'text-ink-3' : 'text-ink')}>
              <span aria-hidden className="inline-block h-[3px] w-4 rounded" style={{ background: colour(i) }} />
              <span className="tnum text-ink-2">{f.rank(s.points[s.points.length - 1]?.rank)}</span>
              <span className="max-w-44 truncate">{s.app.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
