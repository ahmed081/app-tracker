import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, LoaderCircle, Star } from 'lucide-react';
import { coveredByAllCharts, followRequest, ownWatch, targetId, type FollowTarget } from '@/domain/watch';
import { useMutation } from '@/features/manage/useMutation';
import { useResource } from '@/features/remote/useResource';
import { cn } from '@/components/ui/cn';

const NO_PARAMS = {} as Record<string, never>;

/**
 * Follow state of one target, with an optimistic toggle: the star changes at
 * once and goes back if the save fails (a 401 opens the admin-key prompt).
 */
function useFollow(target: FollowTarget) {
  const status = useResource('watchStatus', NO_PARAMS);
  const watches = status.data ?? [];
  const id = targetId(target);
  const follow = useMutation('follow', `follow:${id}`);
  const unfollow = useMutation('updateWatch', `unfollow:${id}`);
  const own = ownWatch(watches, target);
  const actual = own !== undefined;
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  useEffect(() => {
    if (optimistic !== null && optimistic === actual) setOptimistic(null);
  }, [optimistic, actual]);
  useEffect(() => {
    if (follow.status === 'error' || unfollow.status === 'error') setOptimistic(null);
  }, [follow.status, unfollow.status]);

  return {
    followed: optimistic ?? actual,
    coveredByAll: optimistic === null && coveredByAllCharts(watches, target),
    pending: follow.saving || unfollow.saving,
    ready: status.data !== undefined,
    toggle: () => {
      if (own) {
        setOptimistic(false);
        unfollow.run({ id: own.id, active: false });
      } else {
        setOptimistic(true);
        follow.run(followRequest(target));
      }
    },
  };
}

/**
 * ☆ / ★ toggle. `icon` for table rows and lists (the label is for screen
 * readers), `label` for toolbars. `name` is what is followed, for the label.
 */
export function FollowButton({ target, name, variant = 'icon', className }: {
  target: FollowTarget; name?: string; variant?: 'icon' | 'label'; className?: string;
}) {
  const { t } = useTranslation();
  const f = useFollow(target);
  const label = target.kind === 'CHART' ? t('follow.chart')
    : target.chartKey ? t('follow.app', { app: name ?? '' }) : t('follow.appAllCharts', { app: name ?? '' });
  const title = f.coveredByAll ? t('follow.coveredByAll') : target.kind === 'CHART' ? t('follow.chartHint') : label;
  const on = f.followed || f.coveredByAll;
  const Icon = f.pending ? LoaderCircle : Star;
  return (
    <button type="button" aria-pressed={on} aria-disabled={f.coveredByAll || !f.ready || undefined}
      aria-label={variant === 'icon' ? label : undefined} title={title}
      onClick={() => {
        if (f.ready && !f.coveredByAll && !f.pending) f.toggle();
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors',
        variant === 'icon' ? 'p-1.5' : 'border px-3 py-1.5 text-[13px]',
        variant === 'label' && (on ? 'border-felt bg-felt-soft text-felt' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'),
        variant === 'icon' && (on ? 'text-felt' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'),
        f.coveredByAll && 'cursor-default opacity-70',
        className,
      )}>
      <Icon aria-hidden className={cn('size-4', f.pending && 'animate-spin', on && !f.pending && 'fill-current')} />
      {variant === 'label' && (on ? t('follow.following') : t('follow.follow'))}
    </button>
  );
}

/** The app page's Follow button: a menu to follow the app in this chart and/or in all its charts. */
export function FollowMenu({ appleAppId, chartKey, chartLabel, className }: {
  appleAppId: string; chartKey: string | null; chartLabel: string; className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inChart = useFollow({ kind: 'APP', appleAppId, chartKey });
  const all = useFollow({ kind: 'APP', appleAppId });
  const on = (chartKey !== null && inChart.followed) || all.followed;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const items = [
    ...(chartKey !== null ? [{ key: 'chart', label: t('follow.menuThisChart', { chart: chartLabel }), f: inChart }] : []),
    { key: 'all', label: t('follow.menuAllCharts'), f: all },
  ];

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium',
          on ? 'border-felt bg-felt-soft text-felt' : 'border-line bg-surface text-ink hover:border-line-strong')}>
        <Star aria-hidden className={cn('size-4', on && 'fill-current')} />
        {on ? t('follow.following') : t('follow.follow')}
        <ChevronDown aria-hidden className="size-3.5" />
      </button>
      {open && (
        <div role="menu" aria-label={t('follow.menuLabel')}
          className="absolute end-0 top-full z-20 mt-1 w-64 rounded-lg border border-line bg-surface p-1 shadow-lg">
          {items.map(({ key, label, f }) => (
            <button key={key} type="button" role="menuitemcheckbox" aria-checked={f.followed}
              disabled={!f.ready || f.pending} onClick={f.toggle}
              className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-start text-[13px] text-ink hover:bg-surface-2 disabled:opacity-60">
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
                {f.pending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                  : f.followed && <Check aria-hidden className="size-4 text-felt" />}
              </span>
              <span>{label}</span>
            </button>
          ))}
          <p className="px-2.5 pb-1.5 pt-1 text-[12px] text-ink-3">{t('follow.menuHint')}</p>
        </div>
      )}
    </div>
  );
}
