import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { isPartialWindow } from '@/domain/charts';
import { useFormat } from '@/i18n/format';

/** Says when a comparison covers less than the selected period (a chart younger than the window). */
export function PartialWindowNote({ asOf, windowAt, window }: { asOf: string | null; windowAt: string | null; window: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!isPartialWindow(asOf, windowAt, window)) return null;
  return (
    <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
      <History aria-hidden className="size-3.5 shrink-0" />
      {t('window.partial', { when: f.dateTime(windowAt), window: t(`window.long.${window}`) })}
    </p>
  );
}
