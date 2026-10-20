package com.apptracker.events;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Inputs and outputs of {@link EventEngine}. */
public final class EngineModel {

    private EngineModel() {
    }

    /**
     * Tunable rules (configuration, not code).
     *
     * @param displayDepth       chart size shown to users (Top 25); entering/leaving it = NEW_ENTRY/LEFT_CHART
     * @param tiers              tier lines that produce ENTERED_TOP_N / LEFT_TOP_N, e.g. [10, 5]
     * @param bigMovePlaces      a single-step move of at least this many places is a BIG_MOVE
     * @param risingHours        period examined by the rising rule (turned into readings per chart interval)
     * @param risingGainPercent  share of the readings in that period that must be gains
     * @param risingMinNetPlaces minimum net places gained over the window
     * @param newBestAfterDays   NEW_BEST is suppressed this long after the chart's first snapshot
     * @param gapFactor          a step longer than gapFactor x interval is flagged as a gap
     * @param recentRanksKept    ranks remembered per app
     */
    public record Config(
            int displayDepth,
            List<Integer> tiers,
            int bigMovePlaces,
            int risingHours,
            int risingGainPercent,
            int risingMinNetPlaces,
            int newBestAfterDays,
            int gapFactor,
            int recentRanksKept) {

        public static Config defaults() {
            return new Config(25, List.of(10, 5), 5, 24, 50, 10, 7, 3, 25);
        }

        /**
         * Readings-to-readings steps the rising rule examines at this interval: 24 hours
         * is 24 steps when hourly, 6 when every 4 hours. At least 2, and no more than
         * the ranks remembered per app allow.
         */
        public int risingSteps(int intervalMinutes) {
            long steps = Math.round(risingHours * 60.0 / Math.max(1, intervalMinutes));
            return (int) Math.max(2, Math.min(steps, recentRanksKept - 1));
        }

        /** Gains needed among {@code steps}: risingGainPercent of them, rounded up. */
        public int risingMinGains(int steps) {
            return Math.max(1, (int) Math.ceil(steps * risingGainPercent / 100.0));
        }

        /** Every tier with an interval history: 1, the configured tiers, and the display depth. */
        public List<Integer> intervalTiers() {
            java.util.TreeSet<Integer> all = new java.util.TreeSet<>(tiers);
            all.add(1);
            all.add(displayDepth);
            return List.copyOf(all);
        }
    }

    /**
     * One snapshot to process.
     *
     * @param previousRanks ranks in the previous VALID snapshot (empty for the first one)
     * @param previousSlot  slot of the previous VALID snapshot, or null for the first one
     * @param baselineSlot  slot of the chart's first VALID snapshot (equals slot for the first one)
     * @param states        current state of every app found in either snapshot (missing = never seen)
     */
    public record Input(
            long snapshotId,
            Instant slot,
            int intervalMinutes,
            Instant previousSlot,
            Instant baselineSlot,
            Map<Long, Integer> previousRanks,
            Map<Long, Integer> currentRanks,
            Map<Long, AppState> states) {

        public boolean isBaseline() {
            return previousSlot == null;
        }
    }

    public record Event(
            long appId,
            EventType type,
            Integer tier,
            Integer previousRank,
            Integer currentRank,
            boolean primary) {

        public int importance() {
            return type.importance();
        }
    }

    public enum TierAction { OPEN, CLOSE }

    public record TierChange(long appId, int tier, TierAction action, Instant at) {
    }

    /**
     * @param coveredMinutes  minutes since the previous VALID snapshot (null for the first one)
     * @param gap             true when coveredMinutes is unusually long
     * @param tiersHeldOverGap apps/tiers still held across a gap (their open interval becomes uncertain)
     */
    public record Result(
            List<Event> events,
            Map<Long, AppState> states,
            List<TierChange> tierChanges,
            List<TierChange> tiersHeldOverGap,
            Integer coveredMinutes,
            boolean gap) {
    }
}
