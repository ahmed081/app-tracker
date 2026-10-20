import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router';
import { Moon, Search, Settings, Sun, SunMoon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { preferencesActions, type Theme } from '@/features/preferences/preferencesSlice';
import { useChartSelection } from '@/features/charts/useChartSelection';
import { chartPath } from '@/domain/charts';
import { cn } from '@/components/ui/cn';

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON = { system: SunMoon, light: Sun, dark: Moon } as const;

export function AppShell() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { language, theme } = useAppSelector((s) => s.preferences);
  const { chart } = useChartSelection();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const ThemeIcon = THEME_ICON[theme];

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const navItem = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-md px-3 py-1.5 text-[13.5px] font-medium', isActive ? 'bg-felt-soft text-felt' : 'text-ink-2 hover:text-ink');

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t('nav.skip')}
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink">
            <img src="/favicon.svg" alt="" width={26} height={26} />
            {t('app.name')}
          </Link>
          <nav aria-label={t('nav.main')} className="flex items-center gap-1">
            <NavLink to="/" end className={navItem}>{t('nav.overview')}</NavLink>
            {chart && <NavLink to={chartPath(chart.key)} end className={navItem}>{t('nav.ranking')}</NavLink>}
            {chart && <NavLink to={`${chartPath(chart.key)}/movers`} className={navItem}>{t('nav.movers')}</NavLink>}
          </nav>
          <form role="search" onSubmit={onSearch} className="order-last w-full sm:order-none sm:ms-auto sm:w-72">
            <label htmlFor="app-search" className="sr-only">{t('search.label')}</label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input id="app-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full rounded-lg border border-line bg-surface-2 py-1.5 pe-3 ps-8 text-[13.5px] text-ink placeholder:text-ink-3 hover:border-line-strong" />
            </div>
          </form>
          <div className="ms-auto flex items-center gap-1 sm:ms-0">
            <button type="button" onClick={() => dispatch(preferencesActions.languageChanged(language === 'ar' ? 'en' : 'ar'))}
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
              lang={language === 'ar' ? 'en' : 'ar'} aria-label={t('settings.switchLanguage')}>
              {language === 'ar' ? 'English' : 'العربية'}
            </button>
            <NavLink to="/settings" aria-label={t('nav.settings')} title={t('nav.settings')}
              className={({ isActive }) => cn('rounded-md p-2 hover:bg-surface-2 hover:text-ink', isActive ? 'text-felt' : 'text-ink-2')}>
              <Settings aria-hidden className="size-4" />
            </NavLink>
            <button type="button" onClick={() => dispatch(preferencesActions.themeChanged(NEXT_THEME[theme]))}
              className="rounded-md p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label={t('settings.theme', { theme: t(`settings.themeName.${theme}`) })} title={t(`settings.themeName.${theme}`)}>
              <ThemeIcon aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
