// Every GET resource the shared cache can hold: the public reads and the Settings reads.
import { trackerApi } from './trackerApi';
import { manageReads } from './manageApi';

export const resourceApi = { ...trackerApi, ...manageReads };

export type ResourceApi = typeof resourceApi;
