import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import type { Chart } from '@/api/types';
import { chartKey, chartTypeFromSlug, pickDefaultChart } from '@/domain/charts';
import { preferencesActions } from '@/features/preferences/preferencesSlice';
import { useResource } from '@/features/remote/useResource';

const NO_PARAMS = {} as Record<string, never>;

/**
 * The chart the user is looking at: from the URL on chart pages, otherwise the
 * remembered one, otherwise the first chart with data. Remembers URL choices.
 */
export function useChartSelection() {
  const dispatch = useAppDispatch();
  const params = useParams();
  const remembered = useAppSelector((s) => s.preferences.chartKey);
  const charts = useResource('charts', NO_PARAMS);

  const urlKey = useMemo(() => {
    const type = params.type ? chartTypeFromSlug(params.type) : null;
    const genreId = Number(params.genreId);
    return params.country && type && Number.isInteger(genreId)
      ? chartKey({ country: params.country, genreId, type })
      : null;
  }, [params.country, params.genreId, params.type]);

  const list: Chart[] = charts.data ?? [];
  const chart = urlKey ? list.find((c) => c.key === urlKey) : pickDefaultChart(list, remembered);

  useEffect(() => {
    if (urlKey && urlKey !== remembered && list.some((c) => c.key === urlKey)) {
      dispatch(preferencesActions.chartSelected(urlKey));
    }
  }, [dispatch, urlKey, remembered, list]);

  return {
    charts: list,
    chart,
    /** The requested key even if it does not exist (to show "not found"). */
    requestedKey: urlKey ?? chart?.key ?? null,
    status: charts.status,
    isLoading: charts.isLoading,
    error: charts.error,
    reload: charts.reload,
  };
}
