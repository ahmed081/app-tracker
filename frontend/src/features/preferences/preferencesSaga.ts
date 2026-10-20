// Side effects of preferences: save them, switch the UI language and
// direction, apply the theme, and remember the start of this visit.
import { all, call, select, takeEvery } from 'redux-saga/effects';
import i18n from '@/i18n';
import type { RootState } from '@/app/store';
import { preferencesActions, STORAGE_KEY, type PreferencesState } from './preferencesSlice';

const visitStartedAt = new Date().toISOString();

export function persist(prefs: PreferencesState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, lastVisitAt: visitStartedAt }));
  } catch {
    /* storage unavailable: preferences last for this visit only */
  }
}

export function applyDocumentSettings(prefs: PreferencesState) {
  const root = document.documentElement;
  root.lang = prefs.language;
  root.dir = prefs.language === 'ar' ? 'rtl' : 'ltr';
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
}

function* syncPreferences() {
  const prefs: PreferencesState = yield select((s: RootState) => s.preferences);
  applyDocumentSettings(prefs);
  if (i18n.language !== prefs.language) yield call([i18n, i18n.changeLanguage], prefs.language);
  persist(prefs);
}

export function* preferencesSaga() {
  yield call(syncPreferences);   // on start
  yield all([
    takeEvery(Object.values(preferencesActions).map((a) => a.type), syncPreferences),
  ]);
}
