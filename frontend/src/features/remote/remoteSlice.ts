// One cache for every API resource, keyed by resource name + parameters.
// Screens request data through useResource(); the saga does the fetching.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TrackerApi } from '@/api/trackerApi';

export type ResourceName = keyof TrackerApi;
export type ResourceParams<R extends ResourceName> = Parameters<TrackerApi[R]>[0];
export type ResourceData<R extends ResourceName> = Awaited<ReturnType<TrackerApi[R]>>;

export type RemoteStatus = 'idle' | 'loading' | 'success' | 'error';

export interface RemoteEntry {
  status: RemoteStatus;
  data?: unknown;
  error?: { status: number; message: string };
  fetchedAt?: number;      // last successful response
  requestedAt: number;     // last time a screen asked for it (drives background refresh)
  resource: ResourceName;
  params: unknown;
}

export interface RemoteState {
  entries: Record<string, RemoteEntry>;
}

const initialState: RemoteState = { entries: {} };

/** Stable key: same resource and same parameters (in any order) → same key. */
export function resourceKey(resource: ResourceName, params: unknown): string {
  const sorted = params && typeof params === 'object'
    ? Object.fromEntries(Object.entries(params as Record<string, unknown>)
      .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    : params;
  return `${resource}:${JSON.stringify(sorted ?? {})}`;
}

export interface FetchRequest {
  resource: ResourceName;
  params: unknown;
  key: string;
  force?: boolean;
}

const remoteSlice = createSlice({
  name: 'remote',
  initialState,
  reducers: {
    /** A screen needs this resource (the saga decides whether to call the API). */
    fetchRequested(state, action: PayloadAction<FetchRequest>) {
      const { key, resource, params } = action.payload;
      const entry = state.entries[key];
      if (entry) entry.requestedAt = Date.now();
      else state.entries[key] = { status: 'idle', requestedAt: Date.now(), resource, params };
    },
    fetchStarted(state, action: PayloadAction<{ key: string }>) {
      const entry = state.entries[action.payload.key];
      if (entry) {
        entry.status = 'loading';
        entry.error = undefined;
      }
    },
    fetchSucceeded(state, action: PayloadAction<{ key: string; data: unknown; fetchedAt: number }>) {
      const entry = state.entries[action.payload.key];
      if (entry) {
        entry.status = 'success';
        entry.data = action.payload.data;
        entry.fetchedAt = action.payload.fetchedAt;
      }
    },
    fetchFailed(state, action: PayloadAction<{ key: string; error: { status: number; message: string } }>) {
      const entry = state.entries[action.payload.key];
      if (entry) {
        // Keep previous data visible on a failed refresh.
        entry.status = 'error';
        entry.error = action.payload.error;
      }
    },
    /** Re-fetch everything screens used recently (timer, window focus, manual refresh). */
    refreshRequested() {},
  },
});

export const remoteActions = remoteSlice.actions;
export default remoteSlice.reducer;
