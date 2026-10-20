// The only module that knows the Settings API's URLs (/api/manage).
// Reads go through the shared cache (useResource); writes through useMutation.
import { getJson, sendJson } from './http';
import type {
  CountryCreate, EventRules, ManagedCountry, ManagedGenre, MetadataRunSummary, RebuildState, RulesResponse,
  StatusResponse, Tracking, TrackingCreate, TrackingUpdate,
} from './manageTypes';

const BASE = '/api/manage';
type NoParams = Record<string, never>;

export const manageReads = {
  manageCountries: (_p: NoParams, signal?: AbortSignal) => getJson<ManagedCountry[]>(`${BASE}/countries`, {}, signal),
  manageGenres: (_p: NoParams, signal?: AbortSignal) => getJson<ManagedGenre[]>(`${BASE}/genres`, {}, signal),
  manageTracking: (_p: NoParams, signal?: AbortSignal) => getJson<Tracking[]>(`${BASE}/tracking`, {}, signal),
  manageRules: (_p: NoParams, signal?: AbortSignal) => getJson<RulesResponse>(`${BASE}/rules`, {}, signal),
  manageStatus: (_p: NoParams, signal?: AbortSignal) => getJson<StatusResponse>(`${BASE}/status`, {}, signal),
};

export const manageWrites = {
  addCountry: (p: CountryCreate) => sendJson<ManagedCountry>('POST', `${BASE}/countries`, p),
  updateCountry: (p: { code: string; name?: string; enabled?: boolean }) =>
    sendJson<ManagedCountry>('PATCH', `${BASE}/countries/${encodeURIComponent(p.code)}`, { name: p.name, enabled: p.enabled }),
  updateGenre: (p: { id: number; enabled: boolean }) =>
    sendJson<ManagedGenre>('PATCH', `${BASE}/genres/${p.id}`, { enabled: p.enabled }),
  addTracking: (p: TrackingCreate) => sendJson<Tracking>('POST', `${BASE}/tracking`, p),
  updateTracking: (p: { id: number } & TrackingUpdate) => {
    const { id, ...body } = p;
    return sendJson<Tracking>('PATCH', `${BASE}/tracking/${id}`, body);
  },
  setTrackingCountry: (p: { id: number; code: string; active: boolean }) =>
    sendJson<Tracking>('PUT', `${BASE}/tracking/${p.id}/countries/${encodeURIComponent(p.code)}`, { active: p.active }),
  saveRules: (p: EventRules) => sendJson<RulesResponse>('PUT', `${BASE}/rules`, p),
  resetRules: (_p: NoParams) => sendJson<RulesResponse>('DELETE', `${BASE}/rules`),
  processEvents: (_p: NoParams) => sendJson<{ processedSnapshots: number }>('POST', `${BASE}/actions/process-events`),
  rebuildEvents: (_p: NoParams) => sendJson<RebuildState>('POST', `${BASE}/actions/rebuild-events`),
  refreshMetadata: (_p: NoParams) => sendJson<MetadataRunSummary>('POST', `${BASE}/actions/refresh-metadata`),
};

export type ManageReads = typeof manageReads;
export type ManageWrites = typeof manageWrites;
