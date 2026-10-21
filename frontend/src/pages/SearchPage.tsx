import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { parseChartKey } from '@/domain/charts';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { AppLabel } from '@/components/app/AppLabel';
import { FollowButton } from '@/components/app/FollowButton';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';

export function SearchPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const results = useResource('search', q.length >= 2 ? { q } : null);

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">
        {q ? t('search.resultsFor', { q }) : t('search.title')}
      </h1>
      <Panel>
        {q.length < 2 ? <EmptyState>{t('search.tooShort')}</EmptyState>
          : results.isLoading ? <SkeletonRows rows={5} />
            : results.error && !results.data ? <ErrorState error={results.error} onRetry={results.reload} />
              : (results.data ?? []).length === 0 ? <EmptyState>{t('search.noResults', { q })}</EmptyState> : (
                <ul className="divide-y divide-line">
                  {results.data!.map((r) => (
                    <li key={r.app.appleAppId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <AppLabel app={r.app} chartKey={r.charts[0]?.chart} size={40} className="min-w-[14rem] flex-1" />
                      <FollowButton target={{ kind: 'APP', appleAppId: r.app.appleAppId }} name={r.app.name} className="order-last" />
                      <ul className="flex flex-wrap gap-2">
                        {r.charts.length === 0 && <li className="text-[12.5px] text-ink-3">{t('search.notRanked')}</li>}
                        {r.charts.map((c) => {
                          const ref = parseChartKey(c.chart);
                          return (
                            <li key={c.chart}>
                              <Link to={`/apps/${r.app.appleAppId}?chart=${encodeURIComponent(c.chart)}`}
                                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12.5px] text-ink-2 hover:border-line-strong">
                                {ref && <span aria-hidden>{flag(ref.country)}</span>}
                                {ref && <span>{f.genre(ref.genreId, '')}</span>}
                                <span className="tnum font-semibold text-ink">{f.rank(c.rank)}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
      </Panel>
    </div>
  );
}
