import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-[22px] font-semibold text-ink">{t('notFound.title')}</h1>
      <p className="mt-2 text-[14px] text-ink-2">{t('notFound.body')}</p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-felt px-4 py-2 text-[14px] font-medium text-surface hover:opacity-90">
        {t('notFound.home')}
      </Link>
    </div>
  );
}
