// The only module that knows the Radar API's URLs (/api/radar).
// Reads go through the shared cache (useResource); writes through useMutation.
import { getJson, sendJson } from './http';
import type { Dismissal, RadarParams, RadarResponse, RadarTheme, ThemeRequest } from './radarTypes';

const BASE = '/api/radar';

export const radarReads = {
  radar: (p: RadarParams, signal?: AbortSignal) => getJson<RadarResponse>(BASE, {
    country: p.country, genre: p.genre, window: p.window, hideKnown: p.hideKnown,
    showDismissed: p.showDismissed, minScore: p.minScore,
  }, signal),
  /** Every theme, switched-off ones included. */
  radarThemes: (_p: Record<string, never>, signal?: AbortSignal) => getJson<RadarTheme[]>(`${BASE}/themes`, {}, signal),
};

export const radarWrites = {
  createTheme: (p: { name: string; keywords: string[] }) => sendJson<RadarTheme>('POST', `${BASE}/themes`, p),
  updateTheme: (p: { id: number } & ThemeRequest) => {
    const { id, ...body } = p;
    return sendJson<RadarTheme>('PUT', `${BASE}/themes/${id}`, body);
  },
  /** active true hides the app from the Radar, false shows it again. */
  dismissApp: (p: { appleAppId: string; active: boolean }) => sendJson<Dismissal>('POST', `${BASE}/dismiss`, p),
};
