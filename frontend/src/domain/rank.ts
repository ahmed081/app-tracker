// Rank movement rules shared by every screen.

export type Direction = 'up' | 'down' | 'same' | 'new' | 'none';

/**
 * Places gained (positive = moved up, because a smaller rank is better).
 * `null` change with a known current rank means the app is new to the comparison.
 */
export function direction(change: number | null | undefined, isNew = false): Direction {
  if (isNew) return 'new';
  if (change === null || change === undefined) return 'none';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'same';
}

/** Ranks gained between two readings: from 10 to 4 is +6. */
export function placesGained(from: number | null | undefined, to: number | null | undefined): number | null {
  return from == null || to == null ? null : from - to;
}

export const TIERS = [1, 5, 10, 25] as const;
/** Events and tier time cover only these places (the backend's display depth). */
export const DISPLAY_DEPTH = 25;
export type Tier = (typeof TIERS)[number];

/** Best tier a rank belongs to: 3 → 5, 8 → 10, 40 → null. */
export function tierOf(rank: number | null | undefined): Tier | null {
  if (rank == null) return null;
  return TIERS.find((t) => rank <= t) ?? null;
}

/** Hide small moves: |change| below the threshold is treated as no movement. */
export function isNoise(change: number | null | undefined, minPlaces: number): boolean {
  return change != null && change !== 0 && Math.abs(change) < minPlaces;
}
