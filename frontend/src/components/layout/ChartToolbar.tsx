import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import type { Chart } from '@/api/types';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { chartPath } from '@/domain/charts';
import { preferencesActions, WINDOWS, type TimeWindow } from '@/features/preferences/preferencesSlice';
import { flag, useFormat } from '@/i18n/format';
import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Freshness } from '@/components/app/Freshness';

/**
 * Which chart (country, category, type) and which time window. Changing the
 * chart keeps the user on the same kind of page.
 */
export function ChartToolbar({ charts, chart, showWindow = true }: { charts: Chart[]; chart: Chart; showWindow?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const timeWindow = useAppSelector((s) => s.preferences.window);

  const goTo = (next: Chart | undefined) => {
    if (!next || next.key === chart.key) return;
    dispatch(preferencesActions.chartSelected(next.key));
    if (location.pathname.startsWith('/charts/')) {
      const suffix = location.pathname.endsWith('/movers') ? '/movers' : '';
      navigate(`${chartPath(next.key)}${suffix}`);
    }
  };

  const countries = [...new Set(charts.map((c) => c.country))];
  const genres = charts.filter((c) => c.country === chart.country)
    .reduce<Chart[]>((acc, c) => (acc.some((x) => x.genreId === c.genreId) ? acc : [...acc, c]), []);
  const types = charts.filter((c) => c.country === chart.country && c.genreId === chart.genreId);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select label={t('context.country')} showLabel value={chart.country}
        options={countries.map((c) => ({ value: c, label: `${flag(c)} ${f.country(c)}` }))}
        onChange={(c) => goTo(charts.find((x) => x.country === c && x.genreId === chart.genreId && x.chartType === chart.chartType)
          ?? charts.find((x) => x.country === c))} />
      <Select label={t('context.category')} showLabel value={String(chart.genreId)}
        options={genres.map((g) => ({ value: String(g.genreId), label: f.genre(g.genreId, g.genreName) }))}
        onChange={(g) => goTo(charts.find((x) => x.country === chart.country && x.genreId === Number(g) && x.chartType === chart.chartType)
          ?? charts.find((x) => x.country === chart.country && x.genreId === Number(g)))} />
      <Select label={t('context.chart')} showLabel value={chart.chartType}
        options={types.map((c) => ({ value: c.chartType, label: f.chartType(c.chartType) }))}
        onChange={(type) => goTo(types.find((x) => x.chartType === type))} />
      {showWindow && (
        <div className="flex flex-col gap-1">
          <span aria-hidden className="text-[12px] text-ink-3">{t('window.label')}</span>
          <SegmentedControl label={t('window.label')} value={timeWindow}
            options={WINDOWS.map((w) => ({ value: w, label: t(`window.short.${w}`) }))}
            onChange={(w: TimeWindow) => dispatch(preferencesActions.windowChanged(w))} />
        </div>
      )}
      <Freshness asOf={chart.asOf} delayed={chart.delayed} className="ms-auto pb-2" />
    </div>
  );
}
