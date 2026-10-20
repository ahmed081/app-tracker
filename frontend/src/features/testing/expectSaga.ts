// Runs the real store and sagas with fetch replaced, to test the request flow.
import { createStore } from '@/app/store';
import { remoteActions, resourceKey } from '@/features/remote/remoteSlice';

export async function expectSaga() {
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify([{ key: 'ph/7006/top-free' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const store = createStore();
    const key = resourceKey('charts', {});
    store.dispatch(remoteActions.fetchRequested({ resource: 'charts', params: {}, key }));
    await new Promise((r) => setTimeout(r, 20));
    store.dispatch(remoteActions.fetchRequested({ resource: 'charts', params: {}, key }));
    await new Promise((r) => setTimeout(r, 20));
    return { status: store.getState().remote.entries[key]?.status, calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}
