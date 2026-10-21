// The only module that knows the watchlist API's URLs (/api/watch).
// Reads go through the shared cache (useResource); writes through useMutation.
import { getJson, sendJson } from './http';
import type { FollowRequest, Watch, WatchlistResponse, WatchUpdate } from './watchTypes';

const BASE = '/api/watch';

export const watchReads = {
  watchlist: (p: { window: string }, signal?: AbortSignal) => getJson<WatchlistResponse>(BASE, { window: p.window }, signal),
  /** Every active watch: one small list that all Follow buttons on a page share. */
  watchStatus: (_p: Record<string, never>, signal?: AbortSignal) => getJson<Watch[]>(`${BASE}/status`, {}, signal),
};

export const watchWrites = {
  follow: (p: FollowRequest) => sendJson<Watch>('POST', BASE, p),
  updateWatch: (p: { id: number } & WatchUpdate) => {
    const { id, ...body } = p;
    return sendJson<Watch>('PUT', `${BASE}/${id}`, body);
  },
};

export type WatchWrites = typeof watchWrites;
