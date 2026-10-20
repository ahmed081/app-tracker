// Saving from the Settings menu: one entry per form or switch (its id), plus
// the admin-key prompt shown when the server answers 401.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ManageWrites } from '@/api/manageApi';

export type MutationName = keyof ManageWrites;
export type MutationParams<M extends MutationName> = Parameters<ManageWrites[M]>[0];
export type MutationData<M extends MutationName> = Awaited<ReturnType<ManageWrites[M]>>;

export type MutationStatus = 'idle' | 'saving' | 'success' | 'error';

export interface MutationEntry {
  status: MutationStatus;
  error?: { status: number; message: string };
  fieldErrors?: Record<string, string>;
  data?: unknown;
  at?: number;
}

export interface ManageState {
  mutations: Record<string, MutationEntry>;
  adminKeyPrompt: boolean;
}

const initialState: ManageState = { mutations: {}, adminKeyPrompt: false };

export interface MutationRequest {
  op: MutationName;
  id: string;
  params: unknown;
}

const manageSlice = createSlice({
  name: 'manage',
  initialState,
  reducers: {
    mutationRequested(state, action: PayloadAction<MutationRequest>) {
      state.mutations[action.payload.id] = { status: 'saving' };
    },
    mutationSucceeded(state, action: PayloadAction<{ id: string; data: unknown; at: number }>) {
      state.mutations[action.payload.id] = { status: 'success', data: action.payload.data, at: action.payload.at };
    },
    mutationFailed(state, action: PayloadAction<{
      id: string; error: { status: number; message: string }; fieldErrors: Record<string, string>;
    }>) {
      const { id, error, fieldErrors } = action.payload;
      state.mutations[id] = { status: 'error', error, fieldErrors };
    },
    mutationReset(state, action: PayloadAction<{ id: string }>) {
      delete state.mutations[action.payload.id];
    },
    /** The server wants an admin key (401). */
    adminKeyRequired(state) {
      state.adminKeyPrompt = true;
    },
    adminKeyEntered(state, _action: PayloadAction<string>) {
      state.adminKeyPrompt = false;
    },
    adminKeyDismissed(state) {
      state.adminKeyPrompt = false;
    },
  },
});

export const manageActions = manageSlice.actions;
export default manageSlice.reducer;
