import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { EventRules, RulesResponse } from '@/api/manageTypes';
import { ruleLimits, sameRules, validateRules, type FieldErrors } from '@/domain/manage';
import { useMutation } from '@/features/manage/useMutation';
import { useResource } from '@/features/remote/useResource';
import { useFormat } from '@/i18n/format';
import { Button } from '@/components/ui/Button';
import { Field, TextInput, ToggleChip } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Panel } from '@/components/ui/Panel';
import { Loaded, NO_PARAMS, SaveError } from './shared';

type NumberRule = Exclude<keyof EventRules, 'tiers'>;
const NUMBER_RULES: NumberRule[] = ['bigMovePlaces', 'risingHours', 'risingGainPercent', 'risingMinNetPlaces', 'newBestAfterDays'];

export function RulesPage() {
  const rules = useResource('manageRules', NO_PARAMS);
  return <Loaded resource={rules} rows={6}>{(data) => <RulesForm data={data} />}</Loaded>;
}

function RulesForm({ data }: { data: RulesResponse }) {
  const { t } = useTranslation();
  const f = useFormat();
  const save = useMutation('saveRules');
  const reset = useMutation('resetRules');
  const rebuild = useMutation('rebuildEvents');
  const [rules, setRules] = useState<EventRules>(data.rules);
  const [text, setText] = useState(() => asText(data.rules));
  const [errors, setErrors] = useState<FieldErrors>({});

  // Saved or reset (here or elsewhere): show what the server now holds. A background
  // refresh with the same rules leaves edits in progress alone.
  const savedKey = `${JSON.stringify(data.rules)}|${data.updatedAt}`;
  useEffect(() => {
    setRules(data.rules);
    setText(asText(data.rules));
    setErrors({});
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = !sameRules(rules, data.rules);
  const setNumber = (field: NumberRule, value: string) => {
    setText((s) => ({ ...s, [field]: value }));
    setRules((r) => ({ ...r, [field]: value.trim() === '' ? Number.NaN : Number(value) }));
  };
  const toggleTier = (tier: number, on: boolean) =>
    setRules((r) => ({ ...r, tiers: on ? [...r.tiers, tier].sort((a, b) => b - a) : r.tiers.filter((x) => x !== tier) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateRules(rules, data.tierChoices);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      rebuild.reset();
      save.run(rules);
    }
  };
  const fieldError = (field: string) => {
    const key = errors[field];
    if (!key) return save.fieldErrors[field];
    if (key !== 'manage.error.range') return t(key);
    const [min, max] = ruleLimits(field as NumberRule);
    return t(key, { min, max });
  };
  const justSaved = (save.status === 'success' || reset.status === 'success') && !changed;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Notice>
        {data.custom
          ? t('manage.rules.custom', { when: f.dateTime(data.updatedAt) })
          : t('manage.rules.defaults')}
      </Notice>

      <Panel title={t('manage.rules.tiersTitle')} description={t('manage.rules.tiersHint')}>
        <div role="group" aria-label={t('manage.rules.tiersTitle')} className="flex flex-wrap gap-1.5">
          {data.tierChoices.map((tier) => (
            <ToggleChip key={tier} selected={rules.tiers.includes(tier)} onChange={(on) => toggleTier(tier, on)}>
              {t('chart.topN', { n: tier })}
            </ToggleChip>
          ))}
        </div>
        {fieldError('tiers') && <p role="alert" className="mt-2 text-[12px] text-down">{fieldError('tiers')}</p>}
      </Panel>

      <Panel title={t('manage.rules.movesTitle')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NUMBER_RULES.map((field) => (
            <Field key={field} label={t(`manage.rules.field.${field}`)} hint={t(`manage.rules.hint.${field}`)} error={fieldError(field)}>
              {({ id, describedBy, invalid }) => {
                const [min, max] = ruleLimits(field);
                return (
                  <TextInput id={id} describedBy={describedBy} invalid={invalid} type="number" inputMode="numeric"
                    min={min} max={max} value={text[field]} onChange={(v) => setNumber(field, v)} className="tnum" />
                );
              }}
            </Field>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-ink-3">
          {t('manage.rules.defaultsAre', {
            tiers: data.defaults.tiers.map((n) => t('chart.topN', { n })).join(', '),
            bigMove: data.defaults.bigMovePlaces,
            hours: data.defaults.risingHours,
            percent: data.defaults.risingGainPercent,
            net: data.defaults.risingMinNetPlaces,
            days: data.defaults.newBestAfterDays,
          })}
        </p>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" busy={save.saving} disabled={!changed}>{t('manage.action.save')}</Button>
        {changed && (
          <Button variant="ghost" onClick={() => { setRules(data.rules); setText(asText(data.rules)); setErrors({}); }}>
            {t('manage.rules.discard')}
          </Button>
        )}
        {data.custom && (
          <Button variant="ghost" busy={reset.saving} icon={<RotateCcw aria-hidden className="size-3.5" />}
            onClick={() => { rebuild.reset(); reset.run(NO_PARAMS); }}>
            {t('manage.rules.reset')}
          </Button>
        )}
      </div>
      <SaveError error={save.error} />
      <SaveError error={reset.error} />

      {justSaved && rebuild.status !== 'success' && (
        <Notice tone="success" title={t('manage.rules.saved')}
          action={(
            <Button size="sm" busy={rebuild.saving} onClick={() => rebuild.run(NO_PARAMS)}>{t('manage.action.recompute')}</Button>
          )}>
          {t('manage.rules.savedHint')}
        </Notice>
      )}
      {rebuild.status === 'success' && <Notice tone="success">{t('manage.status.rebuildStarted')}</Notice>}
      <SaveError error={rebuild.error} />
    </form>
  );
}

function asText(rules: EventRules): Record<NumberRule, string> {
  return Object.fromEntries(NUMBER_RULES.map((k) => [k, String(rules[k])])) as Record<NumberRule, string>;
}
