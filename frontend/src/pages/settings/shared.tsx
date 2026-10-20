// Small pieces shared by the Settings pages.
import { useTranslation } from 'react-i18next';
import type { ResourceResult } from '@/features/remote/useResource';
import { ErrorState, SkeletonRows } from '@/components/ui/States';
import { Notice } from '@/components/ui/Notice';
import { INTERVAL_CHOICES } from '@/domain/manage';

export const NO_PARAMS = {} as Record<string, never>;

/** Loading and error states for a Settings resource; renders `children` once data is there. */
export function Loaded<T>({ resource, rows = 5, children }: {
  resource: ResourceResult<T>; rows?: number; children: (data: T) => React.ReactNode;
}) {
  if (resource.data !== undefined) return <>{children(resource.data)}</>;
  if (resource.error) {
    // 401 opens the admin-key dialog; the page waits behind it.
    return resource.error.status === 401 ? <AdminKeyNeeded /> : <ErrorState error={resource.error} onRetry={resource.reload} />;
  }
  return <SkeletonRows rows={rows} />;
}

function AdminKeyNeeded() {
  const { t } = useTranslation();
  return <Notice tone="warning" title={t('manage.adminKey.title')}>{t('manage.adminKey.needed')}</Notice>;
}

/** A save that failed: field messages are shown by the form; this covers the rest. */
export function SaveError({ error }: { error: { status: number; message: string } | undefined }) {
  const { t } = useTranslation();
  if (!error || error.status === 400) return null;
  const message = error.status === 0 ? t('error.network')
    : error.status === 401 ? t('manage.adminKey.needed')
      : error.status === 409 ? error.message
        : t('error.server', { status: error.status });
  return <Notice tone="error">{message}</Notice>;
}

/** "Every 12 hours" for the offered intervals, "Every 45 minutes" otherwise. */
export function useIntervalLabel() {
  const { t } = useTranslation();
  return (minutes: number) => ((INTERVAL_CHOICES as readonly number[]).includes(minutes)
    ? t(`manage.interval.${minutes}`)
    : t('manage.interval.custom', { minutes }));
}
