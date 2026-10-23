import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, X } from 'lucide-react';
import type { RadarTheme } from '@/api/radarTypes';
import { KEYWORDS_MAX, normalizeKeywords, validateTheme, type ThemeError } from '@/domain/radar';
import { useMutation } from '@/features/manage/useMutation';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/components/ui/cn';

/**
 * The known themes: an app whose name or subtitle contains a keyword has a known
 * theme, and the theme's words leave "Emerging words" when "Hide known themes" is on.
 * Themes are switched off, never deleted.
 */
export function ThemeEditor({ themes }: { themes: RadarTheme[] }) {
  const { t } = useTranslation();
  const sorted = [...themes].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-6">
      <AddTheme names={themes.map((th) => th.name)} />
      <section aria-labelledby="themes-list" className="rounded-xl border border-line bg-surface">
        <header className="px-5 pt-4">
          <h2 id="themes-list" className="text-[15px] font-semibold text-ink">{t('radar.themes.listTitle')}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{t('radar.themes.listHint')}</p>
        </header>
        <ul className="mt-3 divide-y divide-line/70 border-t border-line">
          {sorted.map((th) => <ThemeRow key={th.id} theme={th} />)}
        </ul>
      </section>
    </div>
  );
}

function errorText(t: TFunction, code: ThemeError | undefined, server?: string) {
  return code ? t(`radar.themes.error.${code}`, { max: KEYWORDS_MAX }) : server;
}

/** A switch, the name, and the keywords as removable chips plus an input to add one (each change saves). */
function ThemeRow({ theme }: { theme: RadarTheme }) {
  const { t } = useTranslation();
  const save = useMutation('updateTheme', `theme:${theme.id}`);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<ThemeError>();

  const saveKeywords = (keywords: string[]) => {
    const errors = validateTheme(theme.name, keywords);
    setError(errors.keywords);
    if (!errors.keywords) save.run({ id: theme.id, keywords: normalizeKeywords(keywords) });
    return !errors.keywords;
  };
  const add = () => {
    if (!draft.trim()) return;
    if (saveKeywords([...theme.keywords, draft])) setDraft('');
  };

  return (
    <li className={cn('flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3', !theme.active && 'bg-surface-2/50')}>
      <Switch checked={theme.active} busy={save.saving} label={t('radar.themes.activeLabel', { name: theme.name })}
        onChange={(active) => save.run({ id: theme.id, active })} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2">
        <p dir="auto" className={cn('text-[14px] font-medium', theme.active ? 'text-ink' : 'text-ink-3')}>
          {theme.name}
          {!theme.active && <span className="ms-2 text-[12px] font-normal text-ink-3">{t('radar.themes.off')}</span>}
        </p>
        <ul aria-label={t('radar.themes.keywordsOf', { name: theme.name })} className="flex flex-wrap items-center gap-1.5">
          {theme.keywords.map((k) => (
            <li key={k} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pe-1 ps-2.5 text-[12.5px] text-ink-2">
              <span dir="auto">{k}</span>
              <button type="button" disabled={save.saving || theme.keywords.length === 1}
                aria-label={t('radar.themes.removeKeyword', { keyword: k })}
                title={theme.keywords.length === 1 ? t('radar.themes.lastKeyword') : t('radar.themes.removeKeyword', { keyword: k })}
                onClick={() => saveKeywords(theme.keywords.filter((x) => x !== k))}
                className="rounded-full p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40">
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
          <li className="inline-flex items-center gap-1">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }} aria-label={t('radar.themes.addKeywordTo', { name: theme.name })} placeholder={t('radar.themes.addKeyword')}
              className="w-32 rounded-full border border-dashed border-line bg-surface px-2.5 py-0.5 text-[12.5px] text-ink placeholder:text-ink-3 hover:border-line-strong" />
            {draft.trim() && (
              <button type="button" onClick={add} aria-label={t('radar.themes.addKeywordTo', { name: theme.name })}
                className="rounded-full p-1 text-felt hover:bg-felt-soft">
                <Plus aria-hidden className="size-3.5" />
              </button>
            )}
          </li>
        </ul>
        {(error || save.status === 'error') && save.error?.status !== 401 && (
          <p role="alert" className="text-[12px] text-down">
            {errorText(t, error, save.fieldErrors.keywords ?? save.fieldErrors.name ?? save.error?.message)}
          </p>
        )}
      </div>
    </li>
  );
}

/** Name plus keywords (type one and press Enter or a comma). */
function AddTheme({ names }: { names: string[] }) {
  const { t } = useTranslation();
  const create = useMutation('createTheme', 'theme:new');
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateTheme>>({});

  const { status, reset } = create;
  useEffect(() => {
    if (status !== 'success') return;
    setName('');
    setKeywords([]);
    setDraft('');
    setErrors({});
    const timer = setTimeout(reset, 4000);
    return () => clearTimeout(timer);
  }, [status, reset]);

  const pushDraft = () => {
    const next = normalizeKeywords([...keywords, ...draft.split(',')]);
    setKeywords(next);
    setDraft('');
    return next;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      pushDraft();
    } else if (e.key === 'Backspace' && !draft && keywords.length) {
      setKeywords(keywords.slice(0, -1));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const all = pushDraft();
    const found = validateTheme(name, all, names);
    setErrors(found);
    if (Object.keys(found).length === 0) create.run({ name: name.trim().replace(/\s+/g, ' '), keywords: all });
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-semibold text-ink">{t('radar.themes.addTitle')}</h2>
      <p className="mt-0.5 text-[13px] text-ink-3">{t('radar.themes.addHint')}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-start">
        <Field label={t('radar.themes.name')} error={errorText(t, errors.name, create.fieldErrors.name)}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} describedBy={describedBy} invalid={invalid} value={name} onChange={setName} maxLength={80} dir="auto" />
          )}
        </Field>
        <Field label={t('radar.themes.keywords')} hint={t('radar.themes.keywordsHint')}
          error={errorText(t, errors.keywords, create.fieldErrors.keywords)}>
          {({ id, describedBy, invalid }) => (
            <div className={cn('flex flex-wrap items-center gap-1.5 rounded-lg border bg-surface px-2 py-1',
              invalid ? 'border-down' : 'border-line hover:border-line-strong')}>
              {keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-felt-soft py-0.5 pe-1 ps-2.5 text-[12.5px] text-felt">
                  <span dir="auto">{k}</span>
                  <button type="button" aria-label={t('radar.themes.removeKeyword', { keyword: k })}
                    onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="rounded-full p-0.5 hover:bg-surface">
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              ))}
              <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={draft}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onBlur={() => draft.trim() && pushDraft()}
                className="min-w-24 flex-1 bg-transparent py-0.5 text-[13px] text-ink outline-none" />
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" busy={create.saving} icon={<Plus aria-hidden className="size-3.5" />} className="md:mt-[22px]">
          {t('radar.themes.add')}
        </Button>
      </div>
      {create.status === 'success' && <Notice tone="success" className="mt-4">{t('radar.themes.added')}</Notice>}
      {create.status === 'error' && create.error?.status !== 400 && create.error?.status !== 401 && (
        <Notice tone="error" className="mt-4">
          {create.error?.status === 409 ? t('radar.themes.duplicate') : t('radar.themes.saveFailed')}
        </Notice>
      )}
    </form>
  );
}
