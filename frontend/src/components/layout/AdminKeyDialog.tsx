import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { useAppDispatch } from '@/app/hooks';
import { manageActions } from '@/features/manage/manageSlice';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';

/**
 * Asked when the server answers 401: in Settings, or on a watchlist write anywhere.
 * The key is kept in this tab only (sessionStorage).
 */
export function AdminKeyDialog() {
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
