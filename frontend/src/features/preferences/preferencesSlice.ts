// What the user chose: language, theme, chart, time window, noise filter,
// and when they last visited. Persisted in the browser by preferencesSaga.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Language = 'en' | 'ar';
export type Theme = 'system' | 'light' | 'dark';
export const WINDOWS = ['1h', '24h', '7d', '30d'] as const;
export type TimeWindow = (typeof WINDOWS)[number];

export interface PreferencesState {
  language: Language;
  theme: Theme;
  window: TimeWindow;
  /** Hide moves smaller than this many places (0 = show all). */
  minPlaces: number;
  /** Chart shown on the overview, e.g. "ph/7006/top-free". */
  chartKey: string | null;
  /** When the previous visit started (for "since your last visit"). */
  previousVisitAt: string | null;
}

export const STORAGE_KEY = 'app-tracker:preferences';

function detectLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function loadPreferences(now: Date = new Date()): PreferencesState {
  const defaults: PreferencesState = {
    language: detectLanguage(), theme: 'system', window: '24h', minPlaces: 0, chartKey: null, previousVisitAt: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<PreferencesState> & { lastVisitAt?: string };
    return {
      language: saved.language === 'ar' || saved.language === 'en' ? saved.language : defaults.language,
      theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : 'system',
      window: WINDOWS.includes(saved.window as TimeWindow) ? (saved.window as TimeWindow) : defaults.window,
      minPlaces: typeof saved.minPlaces === 'number' && saved.minPlaces >= 0 ? saved.minPlaces : 0,
      chartKey: typeof saved.chartKey === 'string' ? saved.chartKey : null,
      // A visit that started less than 30 minutes ago is the same visit.
      previousVisitAt: saved.lastVisitAt && now.getTime() - Date.parse(saved.lastVisitAt) > 30 * 60_000
        ? saved.lastVisitAt
        : (saved.previousVisitAt ?? null),
    };
  } catch {
    return defaults;   // storage unavailable (private mode, blocked): use defaults
  }
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: loadPreferences,
  reducers: {
    languageChanged(state, action: PayloadAction<Language>) {
      state.language = action.payload;
    },
    themeChanged(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
    windowChanged(state, action: PayloadAction<TimeWindow>) {
      state.window = action.payload;
    },
    minPlacesChanged(state, action: PayloadAction<number>) {
      state.minPlaces = Math.max(0, Math.min(50, Math.round(action.payload)));
    },
    chartSelected(state, action: PayloadAction<string>) {
      state.chartKey = action.payload;
    },
  },
});

export const preferencesActions = preferencesSlice.actions;
export default preferencesSlice.reducer;
