import { eventChannel, type EventChannel } from 'redux-saga';
import { all, call, fork, put, select, take, takeEvery, delay } from 'redux-saga/effects';
import { ApiError } from '@/api/http';
import { trackerApi } from '@/api/trackerApi';
import type { RootState } from '@/app/store';
import { remoteActions, type FetchRequest, type RemoteEntry } from './remoteSlice';

/** Data changes about once an hour; a response younger than this is reused as is. */
export const FRESH_MS = 60_000;
/** Background refresh period, and how recently a screen must have used a resource to be refreshed. */
export const REFRESH_EVERY_MS = 5 * 60_000;
export const RECENTLY_USED_MS = 15 * 60_000;

const entryOf = (state: RootState, key: string): RemoteEntry | undefined => state.remote.entries[key];

export function needsFetch(entry: RemoteEntry | undefined, now: number, force = false): boolean {
  if (!entry) return true;
  if (entry.status === 'loading') return false;
  if (force) return true;
  if (entry.status === 'success' && entry.fetchedAt && now - entry.fetchedAt < FRESH_MS) return false;
  return true;
}

function* load(key: string, entry: RemoteEntry) {
  yield put(remoteActions.fetchStarted({ key }));
  try {
    // One generic call: every resource name is a trackerApi function taking (params, signal).
    const fn = trackerApi[entry.resource] as (p: unknown) => Promise<unknown>;
    const data: unknown = yield call(fn, entry.params);
    yield put(remoteActions.fetchSucceeded({ key, data, fetchedAt: Date.now() }));
  } catch (e) {
    const error = e instanceof ApiError
      ? { status: e.status, message: e.message }
      : { status: 0, message: (e as Error).message ?? 'unknown' };
    yield put(remoteActions.fetchFailed({ key, error }));
  }
}

function* onFetchRequested(action: ReturnType<typeof remoteActions.fetchRequested>) {
  const { key, force }: FetchRequest = action.payload;
  const entry: RemoteEntry | undefined = yield select(entryOf, key);
  if (entry && needsFetch(entry, Date.now(), force)) yield fork(load, key, entry);
}

function* onRefreshRequested() {
  const entries: Record<string, RemoteEntry> = yield select((s: RootState) => s.remote.entries);
  const now = Date.now();
  for (const [key, entry] of Object.entries(entries)) {
    if (now - entry.requestedAt < RECENTLY_USED_MS && entry.status !== 'loading') yield fork(load, key, entry);
  }
}

function focusChannel(): EventChannel<true> {
  return eventChannel((emit) => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') emit(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
}

function* refreshOnFocus() {
  const channel: EventChannel<true> = yield call(focusChannel);
  while (true) {
    yield take(channel);
    yield put(remoteActions.refreshRequested());
  }
}

function* refreshPeriodically() {
  while (true) {
    yield delay(REFRESH_EVERY_MS);
    yield put(remoteActions.refreshRequested());
  }
}

export function* remoteSaga() {
  yield all([
    takeEvery(remoteActions.fetchRequested.type, onFetchRequested),
    takeEvery(remoteActions.refreshRequested.type, onRefreshRequested),
    fork(refreshOnFocus),
    fork(refreshPeriodically),
  ]);
}
