import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { KeyRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { manageActions } from '@/features/manage/manageSlice';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';

const TABS = ['tracking', 'countries', 'rules', 'status'] as const;

/** The Settings menu: what to collect, where, the event rules, and whether collection is healthy. */
export function SettingsLayout() {
  const { t } = useTranslation();
  const prompt = useAppSelector((s) => s.manage.adminKeyPrompt);
  const tab = ({ isActive }: { isActive: boolean }) => cn(
    '-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium',
    isActive ? 'border-felt text-felt' : 'border-transparent text-ink-2 hover:text-ink',
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t('manage.title')}</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">{t('manage.subtitle')}</p>
      </div>
      <nav aria-label={t('manage.title')} className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((name) => <NavLink key={name} to={`/settings/${name}`} className={tab}>{t(`manage.tab.${name}`)}</NavLink>)}
      </nav>
      <Outlet />
      {prompt && <AdminKeyDialog />}
    </div>
  );
}

/** Asked when the server answers 401. The key is kept in this tab only (sessionStorage). */
function AdminKeyDialog() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) dispatch(manageActions.adminKeyEntered(key));
  };

  return (
    <dialog ref={ref} aria-labelledby="admin-key-title" onCancel={() => dispatch(manageActions.adminKeyDismissed())}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-4 text-felt" />
          <h2 id="admin-key-title" className="text-[15px] font-semibold">{t('manage.adminKey.title')}</h2>
        </div>
        <p className="text-[13px] text-ink-2">{t('manage.adminKey.body')}</p>
        <Field label={t('manage.adminKey.label')} hint={t('manage.adminKey.hint')}>
          {({ id, describedBy }) => (
            <TextInput id={id} describedBy={describedBy} type="password" autoComplete="off" autoFocus value={key} onChange={setKey} />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dispatch(manageActions.adminKeyDismissed())}>{t('manage.action.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!key.trim()}>{t('manage.adminKey.submit')}</Button>
        </div>
      </form>
    </dialog>
  );
}
