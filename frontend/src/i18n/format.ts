// Locale-aware formatting. Arabic uses Western digits (latn) so ranks and
// changes read the same across languages and line up in tables.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartType } from '@/api/types';

export function intlLocale(language: string): string {
  return language === 'ar' ? 'ar-u-nu-latn' : 'en';
}

export function createFormatters(language: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const locale = intlLocale(language);
  const num = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const decimal1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const dateTime = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  let regions: Intl.DisplayNames | null = null;
  try {
    regions = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    regions = null;
  }

  return {
    number: (n: number | null | undefined) => (n == null ? '—' : num.format(n)),
    compact: (n: number | null | undefined) => (n == null ? '—' : compact.format(n)),
    decimal1: (n: number | null | undefined) => (n == null ? '—' : decimal1.format(n)),
    rank: (r: number | null | undefined) => (r == null ? '—' : `#${num.format(r)}`),
    date: (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—'),
    dayMonth: (iso: string | number | null | undefined) => (iso == null ? '—' : dayMonth.format(new Date(iso))),
    dateTime: (iso: string | number | null | undefined) => (iso == null ? '—' : dateTime.format(new Date(iso))),
    time: (iso: string | number | null | undefined) => (iso == null ? '—' : time.format(new Date(iso))),
    /** "5 minutes ago", "in 2 days", "yesterday" */
    relative: (iso: string | null | undefined, now: number = Date.now()) => {
      if (!iso) return '—';
      const seconds = Math.round((Date.parse(iso) - now) / 1000);
      const abs = Math.abs(seconds);
      if (abs < 60) return relative.format(0, 'minute');
      if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
      if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
      return relative.format(Math.round(seconds / 86400), 'day');
    },
    /** "34 h" or "3.5 d" style durations from hours */
    hours: (h: number | null | undefined) => {
      if (h == null) return '—';
      return h >= 48 ? t('unit.days', { value: decimal1.format(h / 24) }) : t('unit.hours', { value: num.format(Math.round(h)) });
    },
    bytes: (b: number | null | undefined) => (b == null ? '—' : t('unit.megabytes', { value: num.format(Math.round(b / 1_000_000)) })),
    country: (code: string) => regions?.of(code.toUpperCase()) ?? code.toUpperCase(),
    /** Genre names from Apple are English; known ones are translated. */
    genre: (id: number, fallback: string) => t(`genre.${id}`, { defaultValue: fallback }),
    chartType: (type: ChartType) => t(`chartType.${type}`),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

export function useFormat(): Formatters {
  const { t, i18n } = useTranslation();
  return useMemo(() => createFormatters(i18n.language, t as never), [i18n.language, t]);
}

/** Emoji flag from a country code: "ph" → 🇵🇭 */
export function flag(code: string): string {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
