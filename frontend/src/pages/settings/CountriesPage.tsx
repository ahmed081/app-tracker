import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { ManagedCountry, ManagedGenre, Tracking } from '@/api/manageTypes';
import { countrySwitchImpact, validateCountry, type FieldErrors } from '@/domain/manage';
import { useMutation } from '@/features/manage/useMutation';
import { useResource } from '@/features/remote/useResource';
import { flag, useFormat } from '@/i18n/format';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Panel } from '@/components/ui/Panel';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/States';
import { Loaded, NO_PARAMS, SaveError } from './shared';

export function CountriesPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const countries = useResource('manageCountries', NO_PARAMS);
  const genres = useResource('manageGenres', NO_PARAMS);
  const tracking = useResource('manageTracking', NO_PARAMS);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title={t('manage.countries.title')} description={t('manage.countries.hint')}>
        <Loaded resource={countries} rows={8}>
          {(list) => list.length === 0 ? <EmptyState>{t('manage.countries.empty')}</EmptyState> : (
            <ul className="divide-y divide-line">
              {sortByName(list, f.country).map((c) => (
                <CountryRow key={c.code} country={c} countries={list} genres={genres.data ?? []} trackings={tracking.data ?? []} />
              ))}
            </ul>
          )}
        </Loaded>
      </Panel>
      <Panel title={t('manage.countries.addTitle')} description={t('manage.countries.addHint')} className="self-start">
        <AddCountryForm existing={countries.data ?? []} />
      </Panel>
    </div>
  );
}

function CountryRow({ country, countries, genres, trackings }: {
  country: ManagedCountry; countries: ManagedCountry[]; genres: ManagedGenre[]; trackings: Tracking[];
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const save = useMutation('updateCountry', `country:${country.code}`);
  const [confirming, setConfirming] = useState(false);
  const name = f.country(country.code);
  // Switching off a country that is being collected asks first.
  const stops = country.enabled ? countrySwitchImpact(country.code, false, countries, genres, trackings) : 0;
  const starts = country.enabled ? 0 : countrySwitchImpact(country.code, true, countries, genres, trackings);

  const toggle = (enabled: boolean) => {
    if (!enabled && stops > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    save.run({ code: country.code, enabled });
  };

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="w-7 shrink-0 text-center text-[18px] leading-none">{flag(country.code)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink">{name}</p>
          <p className="text-[12.5px] text-ink-3">
            {country.enabled
              ? t('manage.countries.activeCharts', { count: country.activeCharts })
              : starts > 0 ? t('manage.countries.wouldStart', { count: starts }) : t('manage.countries.off')}
          </p>
        </div>
        <Switch checked={country.enabled} onChange={toggle} busy={save.saving}
          label={t('manage.countries.collectIn', { country: name })} />
      </div>
      {confirming && (
        <Notice tone="warning" className="mt-3" title={t('manage.countries.confirmOff', { country: name })}
          action={(
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t('manage.action.cancel')}</Button>
              <Button size="sm" variant="danger" onClick={() => toggle(false)}>{t('manage.action.switchOff')}</Button>
            </div>
          )}>
          {t('manage.confirm.stopCharts', { count: stops })}
        </Notice>
      )}
      {save.error && <div className="mt-2"><SaveError error={save.error} /></div>}
    </li>
  );
}

function AddCountryForm({ existing }: { existing: ManagedCountry[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const add = useMutation('addCountry');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Empty the form once the country is added.
  useEffect(() => {
    if (add.status !== 'success') return;
    setCode('');
    setName('');
    setNameEdited(false);
  }, [add.status]);

  // Suggest the English country name from the code; the name is stored as typed.
  const onCode = (value: string) => {
    const next = value.trim().toLowerCase().slice(0, 2);
    setCode(next);
    if (!nameEdited) setName(next.length === 2 ? englishRegion(next) : '');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateCountry({ code, name }, existing);
    setErrors(found);
    if (Object.keys(found).length === 0) add.run({ code: code.trim().toLowerCase(), name: name.trim(), enabled });
  };

  const fieldError = (field: string) => (errors[field] ? t(errors[field]!) : add.fieldErrors[field]);
  const added = add.status === 'success' && add.data;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
        <Field label={t('manage.countries.code')} error={fieldError('code')}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} describedBy={describedBy} invalid={invalid} value={code} onChange={onCode}
              placeholder="jp" maxLength={2} autoCapitalize="none" spellCheck={false} dir="ltr" />
          )}
        </Field>
        <Field label={t('manage.countries.name')} error={fieldError('name')}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} describedBy={describedBy} invalid={invalid} value={name} maxLength={80} dir="auto"
              onChange={(v) => { setName(v); setNameEdited(true); }} />
          )}
        </Field>
      </div>
      <label className="flex items-center gap-3 text-[13px] text-ink-2">
        <Switch checked={enabled} onChange={setEnabled} label={t('manage.countries.enableNow')} />
        {t('manage.countries.enableNow')}
      </label>
      <Button type="submit" variant="primary" busy={add.saving} icon={<Plus aria-hidden className="size-3.5" />}>
        {t('manage.countries.add')}
      </Button>
      {added && <Notice tone="success">{t('manage.countries.added', { country: f.country(added.code) })}</Notice>}
      <SaveError error={add.error} />
    </form>
  );
}

function englishRegion(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? '';
  } catch {
    return '';
  }
}

/** Switched-on countries first, then by name in the current language. */
function sortByName(countries: ManagedCountry[], name: (code: string) => string): ManagedCountry[] {
  return [...countries].sort((a, b) => Number(b.enabled) - Number(a.enabled) || name(a.code).localeCompare(name(b.code)));
}
