// Every GET resource the shared cache can hold (the public reads, the Settings
// reads, the watchlist reads), and every write the mutation saga can run.
import { trackerApi } from './trackerApi';
import { manageReads, manageWrites } from './manageApi';
import { watchReads, watchWrites } from './watchApi';

export const resourceApi = { ...trackerApi, ...manageReads, ...watchReads };

export type ResourceApi = typeof resourceApi;

export const writeApi = { ...manageWrites, ...watchWrites };

export type WriteApi = typeof writeApi;
