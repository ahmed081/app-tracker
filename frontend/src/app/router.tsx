import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Pages load on demand, so the charting library is fetched only when a page needs it.
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/charts/:country/:genreId/:type', lazy: async () => ({ Component: (await import('@/pages/RankingPage')).RankingPage }) },
      { path: '/charts/:country/:genreId/:type/movers', lazy: async () => ({ Component: (await import('@/pages/MoversPage')).MoversPage }) },
      { path: '/apps/:appleAppId', lazy: async () => ({ Component: (await import('@/pages/AppPage')).AppPage }) },
      { path: '/search', lazy: async () => ({ Component: (await import('@/pages/SearchPage')).SearchPage }) },
      {
        path: '/settings',
        lazy: async () => ({ Component: (await import('@/pages/settings/SettingsLayout')).SettingsLayout }),
        children: [
          { index: true, element: <Navigate to="tracking" replace /> },
          { path: 'tracking', lazy: async () => ({ Component: (await import('@/pages/settings/TrackingPage')).TrackingPage }) },
          { path: 'countries', lazy: async () => ({ Component: (await import('@/pages/settings/CountriesPage')).CountriesPage }) },
          { path: 'rules', lazy: async () => ({ Component: (await import('@/pages/settings/RulesPage')).RulesPage }) },
          { path: 'status', lazy: async () => ({ Component: (await import('@/pages/settings/StatusPage')).StatusPage }) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
