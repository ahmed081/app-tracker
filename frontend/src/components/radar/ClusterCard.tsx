import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { RadarCluster } from '@/api/radarTypes';
import { useFormat } from '@/i18n/format';
import { AppLabel } from '@/components/app/AppLabel';
import { FollowButton } from '@/components/app/FollowButton';
import { Sparkline } from '@/components/charts/Sparkline';
import { AppIcon } from '@/components/ui/AppIcon';
import { cn } from '@/components/ui/cn';
import { DismissButton } from './DismissButton';

/** A possible new niche: the app seen first, the later apps of other developers that look like it, and what they add up to. */
export function ClusterCard({ cluster, chartLabel }: { cluster: RadarCluster; chartLabel: (key: string) => string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const o = cluster.originator;
  return (
    <li className={cn('flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4', cluster.dismissed && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-3">
            {cluster.word ? t('radar.clusterWord', { word: cluster.word }) : t('radar.clusterNames')}
          </p>
          <p className="text-[12px] text-ink-3">{t('radar.originatorSince', { when: f.date(cluster.originatorFirstSeenAt) })}</p>
        </div>
        {o && (
          <div className="-me-1.5 -mt-1 flex shrink-0 items-center">
            <FollowButton target={{ kind: 'APP', appleAppId: o.appleAppId, chartKey: cluster.chart }} name={o.name} />
            <DismissButton appleAppId={o.appleAppId} name={o.name} dismissed={cluster.dismissed} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <AppLabel app={o} chartKey={cluster.chart ?? undefined} size={40} className="flex-1" />
        <Sparkline points={cluster.trend} />
      </div>
      {cluster.chart && <p className="-mt-2 ps-[52px] text-[12px] text-ink-3">{chartLabel(cluster.chart)}</p>}
      <div className="border-t border-line pt-3">
        <p className="text-[12px] text-ink-3">{t('radar.followers', { count: cluster.followers.length })}</p>
        <ul className="mt-1.5 space-y-1.5">
          {cluster.followers.map((a) => (
            <li key={a.appleAppId}>
              <Link to={`/apps/${a.appleAppId}`} className="group flex min-w-0 items-center gap-2">
                <AppIcon name={a.name} url={a.iconUrl} seed={a.appleAppId} size={24} />
                <span dir="auto" className="truncate text-[13px] text-ink group-hover:text-felt group-hover:underline">{a.name}</span>
                {a.developer && <span dir="auto" className="truncate text-[12px] text-ink-3">{a.developer}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
        <div>
          <dt className="text-ink-3">{t('radar.clusterPlaces')}</dt>
          <dd className="tnum text-[14px] font-semibold text-ink">{f.number(cluster.placesGained)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">{t('radar.clusterRatings')}</dt>
          <dd className="tnum text-[14px] font-semibold text-ink">{f.number(cluster.ratingsGained)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">{t('radar.clusterCountries')}</dt>
          <dd className="tnum text-[14px] font-semibold text-ink">{f.number(cluster.countries)}</dd>
        </div>
      </dl>
    </li>
  );
}
