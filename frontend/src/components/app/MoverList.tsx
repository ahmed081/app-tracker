import type { Mover } from '@/api/types';
import { useFormat } from '@/i18n/format';
import { AppLabel } from './AppLabel';
import { FollowButton } from './FollowButton';
import { RankDelta } from '@/components/ui/RankDelta';
import { RankTransition } from '@/components/ui/RankTransition';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';

/** Apps with their rank change over a window: "#24 → #6  ↑18". */
export function MoverList({ movers, chartKey, empty, showFrom = true, className }: {
  movers: Mover[]; chartKey: string; empty: string; showFrom?: boolean; className?: string;
}) {
  const f = useFormat();
  if (movers.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ol className={cn('divide-y divide-line', className)}>
      {movers.map((m) => (
        <li key={m.app.appleAppId} className="flex items-center gap-3 py-2">
          <AppLabel app={m.app} chartKey={chartKey} size={32} className="flex-1" />
          {showFrom
            ? <RankTransition from={m.fromRank} to={m.toRank} className="shrink-0 text-[13px]" />
            : <span className="tnum shrink-0 text-[13px] font-semibold text-ink">{f.rank(m.toRank)}</span>}
          <RankDelta change={m.change} isNew={showFrom && m.fromRank == null && m.toRank != null} showNone={false}
            className="w-12 justify-end" />
          <FollowButton target={{ kind: 'APP', appleAppId: m.app.appleAppId, chartKey }} name={m.app.name} />
        </li>
      ))}
    </ol>
  );
}
