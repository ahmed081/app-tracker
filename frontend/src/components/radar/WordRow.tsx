import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BookmarkPlus, Check } from 'lucide-react';
import type { RadarWord } from '@/api/radarTypes';
import { themeFromWord } from '@/domain/radar';
import { useMutation } from '@/features/manage/useMutation';
import { useFormat } from '@/i18n/format';
import { AppIcon } from '@/components/ui/AppIcon';
import { Button } from '@/components/ui/Button';

/**
 * A word that new apps share: how many apps and developers use it, since when,
 * and the apps as small icons. "Save as theme" turns it into a known theme.
 */
export function WordRow({ word, canSave = true }: { word: RadarWord; canSave?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const save = useMutation('createTheme', `theme:word:${word.word}`);
  const saved = save.status === 'success';
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p dir="auto" className="text-[15px] font-semibold text-ink">{word.word}</p>
        <p className="text-[12px] text-ink-3">
          {t('radar.newApps', { count: word.appCount })} · {t('radar.developers', { count: word.developerCount })}
          {word.firstSeenAt && <> · {t('radar.firstAppeared', { when: f.dayMonth(word.firstSeenAt) })}</>}
        </p>
        {save.status === 'error' && save.error?.status !== 401 && (
          <p role="alert" className="text-[12px] text-down">
            {save.error?.status === 409 ? t('radar.themes.duplicate') : t('radar.themes.saveFailed')}
          </p>
        )}
      </div>
      <ul aria-label={t('radar.wordApps', { word: word.word })} className="flex flex-wrap items-center gap-1.5">
        {word.apps.map((a) => (
          <li key={a.appleAppId}>
            <Link to={`/apps/${a.appleAppId}`} title={a.name} aria-label={a.name} className="block rounded-[9px] hover:opacity-80">
              <AppIcon name={a.name} url={a.iconUrl} seed={a.appleAppId} size={28} />
            </Link>
          </li>
        ))}
      </ul>
      {canSave && (
        <Button size="sm" variant={saved ? 'ghost' : 'secondary'} busy={save.saving} disabled={saved}
          icon={saved ? <Check aria-hidden className="size-3.5" /> : <BookmarkPlus aria-hidden className="size-3.5" />}
          onClick={() => save.run(themeFromWord(word.word))}>
          {saved ? t('radar.savedAsTheme') : t('radar.saveAsTheme')}
        </Button>
      )}
    </li>
  );
}
