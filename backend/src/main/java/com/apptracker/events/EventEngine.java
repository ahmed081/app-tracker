package com.apptracker.events;

import com.apptracker.events.EngineModel.Config;
import com.apptracker.events.EngineModel.Event;
import com.apptracker.events.EngineModel.Input;
import com.apptracker.events.EngineModel.Result;
import com.apptracker.events.EngineModel.TierAction;
import com.apptracker.events.EngineModel.TierChange;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Compares a VALID snapshot with the previous VALID snapshot of the same chart
 * and produces events, new app states and tier interval changes.
 *
 * Pure function: no database, no clock. Same input, same output.
 */
public final class EventEngine {

    private final Config config;

    public EventEngine(Config config) {
        this.config = config;
    }

    public Result process(Input in) {
        final int depth = config.displayDepth();
        final boolean baseline = in.isBaseline();
        final Instant slot = in.slot();

        Integer coveredMinutes = baseline ? null
                : (int) Duration.between(in.previousSlot(), slot).toMinutes();
        boolean gap = coveredMinutes != null
                && coveredMinutes > (long) config.gapFactor() * in.intervalMinutes();
        boolean newBestAllowed = !slot.isBefore(in.baselineSlot().plus(Duration.ofDays(config.newBestAfterDays())));

        // Every app present in either snapshot, in a stable order.
        TreeSet<Long> appIds = new TreeSet<>();
        appIds.addAll(in.previousRanks().keySet());
        appIds.addAll(in.currentRanks().keySet());

        List<Event> events = new ArrayList<>();
        Map<Long, AppState> newStates = new LinkedHashMap<>();
        List<TierChange> tierChanges = new ArrayList<>();
        List<TierChange> heldOverGap = new ArrayList<>();

        for (long appId : appIds) {
            Integer p = in.previousRanks().get(appId);   // null = absent before
            Integer c = in.currentRanks().get(appId);    // null = absent now
            AppState old = in.states().get(appId);
            boolean firstTime = old == null;

            List<Event> appEvents = new ArrayList<>();
            boolean inPrev = p != null && p <= depth;
            boolean inCur = c != null && c <= depth;

            if (firstTime && c != null) {
                appEvents.add(event(appId, EventType.FIRST_OBSERVED, null, p, c));
            }

            if (!baseline) {
                // Entering / leaving the displayed chart.
                if (!inPrev && inCur) {
                    boolean seenInChartBefore = old != null && old.everInChart();
                    appEvents.add(event(appId, seenInChartBefore ? EventType.RE_ENTRY : EventType.NEW_ENTRY, null, p, c));
                } else if (inPrev && !inCur) {
                    appEvents.add(event(appId, EventType.LEFT_CHART, null, p, c));
                }

                // #1
                if (eq(c, 1) && !eq(p, 1)) appEvents.add(event(appId, EventType.REACHED_NUMBER_ONE, 1, p, c));
                if (eq(p, 1) && !eq(c, 1)) appEvents.add(event(appId, EventType.LOST_NUMBER_ONE, 1, p, c));

                // Tier lines (Top 10, Top 5...)
                for (int tier : config.tiers()) {
                    boolean wasIn = p != null && p <= tier;
                    boolean isIn = c != null && c <= tier;
                    if (!wasIn && isIn) appEvents.add(event(appId, EventType.ENTERED_TOP_N, tier, p, c));
                    if (wasIn && !isIn) appEvents.add(event(appId, EventType.LEFT_TOP_N, tier, p, c));
                }

                // Movement between two observed ranks, when it touches the displayed chart.
                if (p != null && c != null && !p.equals(c) && (p <= depth || c <= depth)) {
                    appEvents.add(event(appId, c < p ? EventType.MOVED_UP : EventType.MOVED_DOWN, null, p, c));
                    if (Math.abs(p - c) >= config.bigMovePlaces()) {
                        appEvents.add(event(appId, EventType.BIG_MOVE, null, p, c));
                    }
                }

                // Personal best inside the displayed chart.
                if (newBestAllowed && inCur && old != null && old.bestRank() != null && c < old.bestRank()) {
                    appEvents.add(event(appId, EventType.NEW_BEST, null, old.bestRank(), c));
                }
            }

            AppState state = nextState(old, appId, c, slot);

            if (!baseline && old != null && state.rising() != old.rising()) {
                appEvents.add(event(appId, state.rising() ? EventType.RISING_STARTED : EventType.RISING_ENDED, null, p, c));
            }

            events.addAll(markPrimary(appEvents));
            newStates.put(appId, state);

            // Tier intervals: 1, configured tiers, display depth.
            for (int tier : config.intervalTiers()) {
                boolean wasIn = p != null && p <= tier;
                boolean isIn = c != null && c <= tier;
                if (!wasIn && isIn) tierChanges.add(new TierChange(appId, tier, TierAction.OPEN, slot));
                if (wasIn && !isIn) tierChanges.add(new TierChange(appId, tier, TierAction.CLOSE, slot));
                if (wasIn && isIn && gap) heldOverGap.add(new TierChange(appId, tier, TierAction.OPEN, slot));
            }
        }

        return new Result(events, newStates, tierChanges, heldOverGap, coveredMinutes, gap);
    }

    private AppState nextState(AppState old, long appId, Integer c, Instant slot) {
        int depth = config.displayDepth();
        boolean inCur = c != null && c <= depth;

        List<Integer> recent = new ArrayList<>(old == null ? List.of() : old.recentRanks());
        recent.add(c);
        while (recent.size() > config.recentRanksKept()) recent.remove(0);

        Integer best = old == null ? null : old.bestRank();
        Instant bestAt = old == null ? null : old.bestRankAt();
        if (c != null && (best == null || c < best)) {
            best = c;
            bestAt = slot;
        }
        Integer worst = old == null ? null : old.worstRank();
        if (c != null && (worst == null || c > worst)) worst = c;

        boolean wasInChart = old != null && old.inChart();
        Instant inChartSince = inCur ? (wasInChart ? old.inChartSince() : slot) : null;

        return new AppState(
                appId,
                c,
                inCur,
                (old != null && old.everInChart()) || inCur,
                inChartSince,
                best,
                bestAt,
                worst,
                old == null ? slot : old.firstObservedAt(),
                c != null ? slot : (old == null ? null : old.lastSeenAt()),
                recent,
                isRising(recent));
    }

    /**
     * Rising: over the last {@code risingWindow} steps, at least {@code risingMinGains}
     * were gains and the app gained at least {@code risingMinNetPlaces} places in total.
     * Every rank in the window must be known.
     */
    boolean isRising(List<Integer> recent) {
        int steps = config.risingWindow();
        if (recent.size() < steps + 1) return false;
        List<Integer> window = recent.subList(recent.size() - steps - 1, recent.size());
        if (window.stream().anyMatch(r -> r == null)) return false;
        int gains = 0;
        for (int i = 1; i < window.size(); i++) {
            if (window.get(i) < window.get(i - 1)) gains++;
        }
        int net = window.get(0) - window.get(window.size() - 1);
        return gains >= config.risingMinGains() && net >= config.risingMinNetPlaces();
    }

    /** The most important event of an app in this snapshot becomes primary. */
    private static List<Event> markPrimary(List<Event> appEvents) {
        Event primary = appEvents.stream()
                .filter(e -> e.importance() > EventType.Importance.NONE)
                .min(Comparator.comparingInt((Event e) -> -e.importance()).thenComparingInt(e -> e.type().ordinal()))
                .orElse(null);
        List<Event> out = new ArrayList<>(appEvents.size());
        for (Event e : appEvents) {
            out.add(e == primary
                    ? new Event(e.appId(), e.type(), e.tier(), e.previousRank(), e.currentRank(), true)
                    : e);
        }
        return out;
    }

    private static Event event(long appId, EventType type, Integer tier, Integer p, Integer c) {
        return new Event(appId, type, tier, p, c, false);
    }

    private static boolean eq(Integer a, int b) {
        return a != null && a == b;
    }
}
