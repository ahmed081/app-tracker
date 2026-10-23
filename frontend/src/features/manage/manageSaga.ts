// Side effects of saving: call the API, then mark the affected resources stale
// so every screen shows the new state. A 401 opens the admin-key prompt.
import { all, call, put, takeEvery } from 'redux-saga/effects';
import { ApiError, setAdminKey } from '@/api/http';
import { writeApi } from '@/api/resources';
import { remoteActions, type ResourceName } from '@/features/remote/remoteSlice';
import { manageActions, type MutationName, type MutationRequest } from './manageSlice';

const MANAGE_READS: ResourceName[] = ['manageCountries', 'manageGenres', 'manageTracking', 'manageRules', 'manageStatus'];
const CONFIG: ResourceName[] = ['manageCountries', 'manageGenres', 'manageTracking', 'manageStatus', 'charts'];
const WATCH: ResourceName[] = ['watchlist', 'watchStatus'];
const RADAR: ResourceName[] = ['radar', 'radarThemes'];

/** What each save changes. Configuration changes reach the chart list once the collector syncs (within a minute). */
export const INVALIDATES: Record<MutationName, ResourceName[]> = {
  addCountry: CONFIG,
  updateCountry: CONFIG,
  saveCategory: CONFIG,
  saveRules: ['manageRules'],
  resetRules: ['manageRules'],
  processEvents: ['manageStatus'],
  rebuildEvents: ['manageStatus'],
  refreshMetadata: ['manageStatus'],
  follow: WATCH,
  updateWatch: WATCH,
  createTheme: RADAR,
  updateTheme: RADAR,
  dismissApp: ['radar'],
};

function* onMutation(action: ReturnType<typeof manageActions.mutationRequested>) {
  const { op, id, params }: MutationRequest = action.payload;
  try {
    const fn = writeApi[op] as (p: unknown) => Promise<unknown>;
    const data: unknown = yield call(fn, params);
    yield put(manageActions.mutationSucceeded({ id, data, at: Date.now() }));
    yield put(remoteActions.invalidated({ resources: INVALIDATES[op] }));
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, (e as Error).message ?? 'unknown');
    yield put(manageActions.mutationFailed({
      id, error: { status: err.status, message: err.message }, fieldErrors: err.fieldErrors,
    }));
    if (err.status === 401) yield put(manageActions.adminKeyRequired());
  }
}

function* onFetchFailed(action: ReturnType<typeof remoteActions.fetchFailed>) {
  if (action.payload.error.status === 401) yield put(manageActions.adminKeyRequired());
}

function* onAdminKeyEntered(action: ReturnType<typeof manageActions.adminKeyEntered>) {
  yield call(setAdminKey, action.payload.trim());
  yield put(remoteActions.invalidated({ resources: MANAGE_READS }));
}

export function* manageSaga() {
  yield all([
    takeEvery(manageActions.mutationRequested.type, onMutation),
    takeEvery(remoteActions.fetchFailed.type, onFetchFailed),
    takeEvery(manageActions.adminKeyEntered.type, onAdminKeyEntered),
  ]);
}
