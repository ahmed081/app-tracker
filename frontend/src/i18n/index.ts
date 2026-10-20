import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';
import { loadPreferences } from '@/features/preferences/preferencesSlice';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: loadPreferences().language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },   // React already escapes
  returnNull: false,
});

export default i18n;
