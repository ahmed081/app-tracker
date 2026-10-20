import type { EventRow, EventType } from '@/api/types';

/** Translation key and values for an event sentence (see locales: event.*). */
export function eventMessage(e: Pick<EventRow, 'type' | 'tier' | 'previousRank' | 'currentRank'> & { app?: { name: string } | null }) {
  const values = {
    app: e.app?.name ?? '',
    from: e.previousRank ?? undefined,
    to: e.currentRank ?? undefined,
    tier: e.tier ?? undefined,
  };
  let key = `event.${e.type}`;
  if (e.type === 'LEFT_CHART') key = e.currentRank != null ? 'event.LEFT_CHART_TO' : 'event.LEFT_CHART';
  if (e.type === 'BIG_MOVE') key = (e.currentRank ?? 0) < (e.previousRank ?? 0) ? 'event.BIG_MOVE_UP' : 'event.BIG_MOVE_DOWN';
  if (e.type === 'REACHED_NUMBER_ONE' && e.previousRank == null) key = 'event.REACHED_NUMBER_ONE_NEW';
  if (e.type === 'ENTERED_TOP_N' && e.previousRank == null) key = 'event.ENTERED_TOP_N_NEW';
  if (e.type === 'LEFT_TOP_N' && e.currentRank == null) key = 'event.LEFT_TOP_N_OUT';
  if (e.type === 'LOST_NUMBER_ONE' && e.currentRank == null) key = 'event.LOST_NUMBER_ONE_OUT';
  return { key, values };
}

export type EventTone = 'up' | 'down' | 'neutral';

const UP: EventType[] = ['REACHED_NUMBER_ONE', 'ENTERED_TOP_N', 'NEW_ENTRY', 'RE_ENTRY', 'NEW_BEST', 'RISING_STARTED', 'MOVED_UP'];
const DOWN: EventType[] = ['LOST_NUMBER_ONE', 'LEFT_TOP_N', 'LEFT_CHART', 'MOVED_DOWN'];   // RISING_ENDED is neutral

export function eventTone(e: Pick<EventRow, 'type' | 'previousRank' | 'currentRank'>): EventTone {
  if (e.type === 'BIG_MOVE') return (e.currentRank ?? Infinity) < (e.previousRank ?? Infinity) ? 'up' : 'down';
  if (UP.includes(e.type)) return 'up';
  if (DOWN.includes(e.type)) return 'down';
  return 'neutral';
}
