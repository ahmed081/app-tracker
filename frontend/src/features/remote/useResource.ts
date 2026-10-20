import { useCallback, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  remoteActions, resourceKey, type RemoteStatus, type ResourceData, type ResourceName, type ResourceParams,
} from './remoteSlice';

export interface ResourceResult<T> {
  data: T | undefined;
  status: RemoteStatus;
  error: { status: number; message: string } | undefined;
  /** True only before the first response (a refresh keeps showing the previous data). */
  isLoading: boolean;
  reload: () => void;
}

/**
 * Typed access to an API resource. Pass `null` as params to skip the request.
 *   const { data } = useResource('ranking', { chartKey, window: '24h', limit: 25 });
 */
export function useResource<R extends ResourceName>(
  resource: R,
  params: ResourceParams<R> | null,
): ResourceResult<ResourceData<R>> {
  const dispatch = useAppDispatch();
  const key = useMemo(() => (params === null ? null : resourceKey(resource, params)), [resource, params]);
  const entry = useAppSelector((s) => (key ? s.remote.entries[key] : undefined));

  const request = useCallback((force: boolean) => {
    // `params` is fully represented by `key`, so it is not a dependency.
    if (key && params !== null) dispatch(remoteActions.fetchRequested({ resource, params, key, force }));
  }, [dispatch, key, resource]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    request(false);
  }, [request]);

  return {
    data: entry?.data as ResourceData<R> | undefined,
    status: entry?.status ?? 'idle',
    error: entry?.error,
    isLoading: !entry || (entry.data === undefined && entry.status !== 'error'),
    reload: () => request(true),
  };
}
