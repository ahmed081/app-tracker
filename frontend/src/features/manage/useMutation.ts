import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { manageActions, type MutationData, type MutationName, type MutationParams, type MutationStatus } from './manageSlice';

export interface MutationResult<M extends MutationName> {
  run: (params: MutationParams<M>) => void;
  reset: () => void;
  status: MutationStatus;
  data: MutationData<M> | undefined;
  error: { status: number; message: string } | undefined;
  /** Server messages per field, for a rejected form (400). */
  fieldErrors: Record<string, string>;
  saving: boolean;
}

/**
 * Typed save through the saga. `id` names this form or switch, so several
 * saves of the same kind (one per row) keep separate states.
 *   const save = useMutation('updateCountry', `country:${code}`);
 *   save.run({ code, enabled: true });
 */
export function useMutation<M extends MutationName>(op: M, id: string = op): MutationResult<M> {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s) => s.manage.mutations[id]);
  const run = useCallback((params: MutationParams<M>) => {
    dispatch(manageActions.mutationRequested({ op, id, params }));
  }, [dispatch, op, id]);
  const reset = useCallback(() => dispatch(manageActions.mutationReset({ id })), [dispatch, id]);
  return {
    run,
    reset,
    status: entry?.status ?? 'idle',
    data: entry?.data as MutationData<M> | undefined,
    error: entry?.error,
    fieldErrors: entry?.fieldErrors ?? {},
    saving: entry?.status === 'saving',
  };
}
