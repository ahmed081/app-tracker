import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useMutation } from '@/features/manage/useMutation';
import { cn } from '@/components/ui/cn';

/** Hides an app from the Radar, or shows a dismissed one again (a 401 opens the admin-key prompt). */
export function DismissButton({ appleAppId, name, dismissed, className }: {
  appleAppId: string; name?: string; dismissed: boolean; className?: string;
}) {
  const { t } = useTranslation();
  const save = useMutation('dismissApp', `dismiss:${appleAppId}`);
  const label = dismissed ? t('radar.undismiss', { app: name ?? '' }) : t('radar.dismiss', { app: name ?? '' });
  const Icon = save.saving ? LoaderCircle : dismissed ? Eye : EyeOff;
  return (
    <button type="button" aria-label={label} title={label} disabled={save.saving}
      onClick={() => save.run({ appleAppId, active: !dismissed })}
      className={cn('inline-flex shrink-0 items-center rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-60',
        className)}>
      <Icon aria-hidden className={cn('size-4', save.saving && 'animate-spin')} />
    </button>
  );
}
