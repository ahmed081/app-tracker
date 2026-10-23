// Every GET resource the shared cache can hold (the public reads, the Settings
// reads, the watchlist and Radar reads), and every write the mutation saga can run.
import { trackerApi } from './trackerApi';
import { manageReads, manageWrites } from './manageApi';
import { watchReads, watchWrites } from './watchApi';
import { radarReads, radarWrites } from './radarApi';

export const resourceApi = { ...trackerApi, ...manageReads, ...watchReads, ...radarReads };

export type ResourceApi = typeof resourceApi;

export const writeApi = { ...manageWrites, ...watchWrites, ...radarWrites };

export type WriteApi = typeof writeApi;
