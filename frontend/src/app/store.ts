import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all, fork } from 'redux-saga/effects';
import preferences from '@/features/preferences/preferencesSlice';
import { preferencesSaga } from '@/features/preferences/preferencesSaga';
import remote from '@/features/remote/remoteSlice';
import { remoteSaga } from '@/features/remote/remoteSaga';
import manage from '@/features/manage/manageSlice';
import { manageSaga } from '@/features/manage/manageSaga';

function* rootSaga() {
  yield all([fork(preferencesSaga), fork(remoteSaga), fork(manageSaga)]);
}

export function createStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: { preferences, remote, manage },
    middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  });
  sagaMiddleware.run(rootSaga);
  return store;
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
