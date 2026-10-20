import { Link } from 'react-router';
import type { AppCard } from '@/api/types';
import { AppIcon } from '@/components/ui/AppIcon';
import { cn } from '@/components/ui/cn';

/** Icon + name + developer, linking to the app page (in the given chart). */
export function AppLabel({ app, chartKey, size = 36, className, showDeveloper = true }: {
  app: AppCard | null | undefined; chartKey?: string; size?: number; className?: string; showDeveloper?: boolean;
}) {
  if (!app) return <span className="text-ink-3">—</span>;
  const to = `/apps/${app.appleAppId}${chartKey ? `?chart=${encodeURIComponent(chartKey)}` : ''}`;
  return (
    <Link to={to} className={cn('group flex min-w-0 items-center gap-3', className)}>
      <AppIcon name={app.name} url={app.iconUrl} seed={app.appleAppId} size={size} />
      <span className="min-w-0">
        <span dir="auto" className="block truncate text-[14px] font-medium text-ink group-hover:text-felt group-hover:underline">{app.name}</span>
        {showDeveloper && app.developer && <span dir="auto" className="block truncate text-[12px] text-ink-3">{app.developer}</span>}
      </span>
    </Link>
  );
}
