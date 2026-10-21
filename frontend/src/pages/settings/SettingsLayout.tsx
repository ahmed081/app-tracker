import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { cn } from '@/components/ui/cn';

const TABS = ['tracking', 'countries', 'rules', 'status'] as const;

/** The Settings menu: what to collect, where, the event rules, and whether collection is healthy. */
export function SettingsLayout() {
  const { t } = useTranslation();
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
    </div>
  );
}
