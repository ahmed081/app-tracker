import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_RADAR_DAYS, parseRadarDays, RADAR_PRESET_DAYS } from '@/domain/radar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { cn } from '@/components/ui/cn';

type Choice = `${number}d` | 'custom';

/**
 * The Radar's period: 4 days, 14 days, last month, or a custom number of days
 * (1 to 90), applied on Enter or when the field loses focus.
 */
export function PeriodPicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const { t } = useTranslation();
  const isPreset = (RADAR_PRESET_DAYS as readonly number[]).includes(days);
  const [custom, setCustom] = useState(!isPreset);
  const [draft, setDraft] = useState(String(days));
  const invalid = custom && parseRadarDays(draft) === null;

  useEffect(() => setDraft(String(days)), [days]);

  const choice: Choice = custom ? 'custom' : `${days}d`;
  const options = [
    ...RADAR_PRESET_DAYS.map((d) => ({ value: `${d}d` as Choice, label: t(`radar.window.${d}d`) })),
    { value: 'custom' as Choice, label: t('radar.window.custom') },
  ];
  const apply = () => {
    const parsed = parseRadarDays(draft);
    if (parsed !== null && parsed !== days) onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden className="text-[12px] text-ink-3">{t('window.label')}</span>
      <div className="flex items-center gap-2">
        <SegmentedControl label={t('window.label')} value={choice} options={options} onChange={(c) => {
          if (c === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(Number(c.slice(0, -1)));
        }} />
        {custom && (
          <input type="number" inputMode="numeric" min={1} max={MAX_RADAR_DAYS} value={draft} dir="ltr"
            aria-label={t('radar.customDays')} title={t('radar.customDaysHint', { max: MAX_RADAR_DAYS })}
            aria-invalid={invalid || undefined}
            onChange={(e) => setDraft(e.target.value)} onBlur={apply}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
            }}
            className={cn('tnum w-20 rounded-lg border bg-surface px-2.5 py-1.5 text-[13px] text-ink hover:border-line-strong',
              invalid ? 'border-down' : 'border-line')} />
        )}
      </div>
    </div>
  );
}
