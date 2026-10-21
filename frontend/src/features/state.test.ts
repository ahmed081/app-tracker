import { describe, expect, it } from 'vitest';
import { expectSaga } from './testing/expectSaga';
import reducer, { remoteActions, resourceKey, type RemoteEntry } from './remote/remoteSlice';
import { FRESH_MS, needsFetch } from './remote/remoteSaga';
import prefsReducer, { loadPreferences, preferencesActions, STORAGE_KEY } from './preferences/preferencesSlice';
import { createStore } from '@/app/store';
import { manageActions } from './manage/manageSlice';

describe('remote cache', () => {
  it('builds the same key whatever the parameter order', () => {
    expect(resourceKey('ranking', { chartKey: 'ph/7006/top-free', window: '24h', limit: 25 }))
      .toBe(resourceKey('ranking', { limit: 25, window: '24h', chartKey: 'ph/7006/top-free' }));
    expect(resourceKey('ranking', { chartKey: 'a', window: '24h', limit: 25 }))
      .not.toBe(resourceKey('ranking', { chartKey: 'a', window: '7d', limit: 25 }));
  });

  it('keeps previous data when a refresh fails', () => {
    const key = 'charts:{}';
    let s = reducer(undefined, remoteActions.fetchRequested({ resource: 'charts', params: {}, key }));
    s = reducer(s, remoteActions.fetchStarted({ key }));
    s = reducer(s, remoteActions.fetchSucceeded({ key, data: [1], fetchedAt: 1 }));
    s = reducer(s, remoteActions.fetchStarted({ key }));
    s = reducer(s, remoteActions.fetchFailed({ key, error: { status: 0, message: 'network' } }));
    expect(s.entries[key]?.status).toBe('error');
    expect(s.entries[key]?.data).toEqual([1]);
  });

  it('decides when to call the API', () => {
    const now = 1_000_000;
    const entry = (over: Partial<RemoteEntry>): RemoteEntry => ({ status: 'success', requestedAt: now, resource: 'charts', params: {}, ...over });
    expect(needsFetch(undefined, now)).toBe(true);
    expect(needsFetch(entry({ status: 'loading' }), now, true)).toBe(false);          // never twice at once
    expect(needsFetch(entry({ fetchedAt: now - 1000 }), now)).toBe(false);            // fresh: reuse
    expect(needsFetch(entry({ fetchedAt: now - FRESH_MS - 1 }), now)).toBe(true);     // stale: refetch
    expect(needsFetch(entry({ fetchedAt: now - 1000 }), now, true)).toBe(true);       // forced
    expect(needsFetch(entry({ status: 'error' }), now)).toBe(true);
  });

  it('runs the fetch saga end to end against a fake API', async () => {
    const result = await expectSaga();
    expect(result.status).toBe('success');
    expect(result.calls).toBe(1);   // a second request for fresh data does not call the API again
  });
});

describe('preferences', () => {
  it('restores saved choices and ignores invalid ones', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: 'ar', theme: 'dark', window: '9y', minPlaces: 3, chartKey: 'ph/7006/top-free' }));
    const p = loadPreferences();
    expect(p).toMatchObject({ language: 'ar', theme: 'dark', window: '24h', minPlaces: 3, chartKey: 'ph/7006/top-free' });
  });

  it('remembers the previous visit only after 30 minutes away', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastVisitAt: '2026-10-19T11:50:00Z' }));
    expect(loadPreferences(now).previousVisitAt).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastVisitAt: '2026-10-19T09:00:00Z' }));
    expect(loadPreferences(now).previousVisitAt).toBe('2026-10-19T09:00:00Z');
  });

  it('clamps the noise filter', () => {
    const s = prefsReducer(loadPreferences(), preferencesActions.minPlacesChanged(500));
    expect(s.minPlaces).toBe(50);
  });
});

describe('saving settings', () => {
  it('marks the affected data stale after a save, and asks for the admin key on 401', async () => {
    const realFetch = globalThis.fetch;
    const answers = [
      { status: 200, body: [{ code: 'ph' }] },                         // GET countries
      { status: 200, body: { code: 'ph', enabled: false } },           // PATCH country
      { status: 200, body: [{ code: 'ph' }] },                         // GET countries again (stale)
      { status: 401, body: { status: 401, detail: 'Missing or wrong X-Admin-Key' } },
    ];
    const calls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      const a = answers.shift()!;
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const store = createStore();
      const key = resourceKey('manageCountries', {});
      store.dispatch(remoteActions.fetchRequested({ resource: 'manageCountries', params: {}, key }));
      await new Promise((r) => setTimeout(r, 20));
      store.dispatch(manageActions.mutationRequested({ op: 'updateCountry', id: 'country:ph', params: { code: 'ph', enabled: false } }));
      await new Promise((r) => setTimeout(r, 20));
      expect(store.getState().manage.mutations['country:ph']?.status).toBe('success');
      expect(calls).toEqual(['GET /api/manage/countries', 'PATCH /api/manage/countries/ph', 'GET /api/manage/countries']);

      store.dispatch(manageActions.mutationRequested({ op: 'updateCountry', id: 'country:ph', params: { code: 'ph', enabled: true } }));
      await new Promise((r) => setTimeout(r, 20));
      expect(store.getState().manage.mutations['country:ph']?.error?.status).toBe(401);
      expect(store.getState().manage.adminKeyPrompt).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('following', () => {
  it('refreshes the watchlist and the Follow buttons after a follow', async () => {
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response(JSON.stringify(url.includes('/status') ? [] : init?.method === 'POST' ? { id: 1 } : { apps: [], charts: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const store = createStore();
      for (const [resource, params] of [['watchlist', { window: '24h' }], ['watchStatus', {}]] as const) {
        store.dispatch(remoteActions.fetchRequested({ resource, params, key: resourceKey(resource, params) }));
      }
      await new Promise((r) => setTimeout(r, 20));
      store.dispatch(manageActions.mutationRequested({ op: 'follow', id: 'f', params: { kind: 'APP', appleAppId: '42' } }));
      await new Promise((r) => setTimeout(r, 20));
      expect(calls.slice(2).sort()).toEqual(['GET /api/watch/status', 'GET /api/watch?window=24h', 'POST /api/watch'].sort());
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
