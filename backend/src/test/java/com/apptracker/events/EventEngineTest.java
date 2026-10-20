package com.apptracker.events;

import com.apptracker.events.EngineModel.Config;
import com.apptracker.events.EngineModel.Event;
import com.apptracker.events.EngineModel.Input;
import com.apptracker.events.EngineModel.Result;
import com.apptracker.events.EngineModel.TierAction;
import com.apptracker.events.EngineModel.TierChange;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventEngineTest {

    private static final Instant T0 = Instant.parse("2026-10-18T10:00:00Z");
    private final EventEngine engine = new EventEngine(Config.defaults());

    /** Runs snapshots in order, carrying state like the real processor does. */
    private final class Chart {
        final EventEngine eng;
        final int intervalMinutes;
        Map<Long, AppState> states = new HashMap<>();
        Map<Long, Integer> previous = Map.of();
        Instant previousSlot = null;
        Instant baselineSlot = null;
        long snapshotId = 0;

        Chart() {
            this(engine);
        }

        Chart(EventEngine eng) {
            this(eng, 60);
        }

        Chart(EventEngine eng, int intervalMinutes) {
            this.eng = eng;
            this.intervalMinutes = intervalMinutes;
        }

        Result next(Instant slot, Map<Long, Integer> current) {
            if (baselineSlot == null) baselineSlot = slot;
            Map<Long, AppState> relevant = new HashMap<>();
            for (Long id : union(previous, current)) {
                if (states.containsKey(id)) relevant.put(id, states.get(id));
            }
            Result r = eng.process(new Input(++snapshotId, slot, intervalMinutes, previousSlot, baselineSlot,
                    previous, current, relevant));
            states.putAll(r.states());
            previous = current;
            previousSlot = slot;
            return r;
        }
    }

    private static List<Long> union(Map<Long, Integer> a, Map<Long, Integer> b) {
        java.util.TreeSet<Long> s = new java.util.TreeSet<>(a.keySet());
        s.addAll(b.keySet());
        return List.copyOf(s);
    }

    /** ranks(10, 20, 30) → app 10 at #1, app 20 at #2, app 30 at #3. */
    private static Map<Long, Integer> ranks(long... appIds) {
        Map<Long, Integer> m = new LinkedHashMap<>();
        for (int i = 0; i < appIds.length; i++) m.put(appIds[i], i + 1);
        return m;
    }

    /** Apps 1..n in order. */
    private static long[] seq(int from, int to) {
        long[] out = new long[to - from + 1];
        for (int i = 0; i < out.length; i++) out[i] = from + i;
        return out;
    }

    private static List<String> types(Result r, long appId) {
        return r.events().stream().filter(e -> e.appId() == appId)
                .map(e -> e.type() + (e.tier() != null && e.type().name().endsWith("_N") ? "_" + e.tier() : ""))
                .sorted().collect(Collectors.toList());
    }

    private static Event primary(Result r, long appId) {
        return r.events().stream().filter(e -> e.appId() == appId && e.primary()).findFirst().orElse(null);
    }

    @Test
    void baselineProducesOnlyFirstObserved() {
        Chart chart = new Chart();
        Result r = chart.next(T0, ranks(seq(1, 100)));

        assertEquals(100, r.events().size());
        assertTrue(r.events().stream().allMatch(e -> e.type() == EventType.FIRST_OBSERVED));
        assertTrue(r.events().stream().noneMatch(Event::primary));
        assertNull(r.coveredMinutes());

        AppState s = r.states().get(7L);
        assertEquals(7, s.currentRank());
        assertTrue(s.inChart());
        assertEquals(T0, s.firstObservedAt());
        assertFalse(r.states().get(30L).inChart());
        // Tier intervals opened for every tier the app is in.
        assertEquals(List.of(1, 5, 10, 25), r.tierChanges().stream()
                .filter(t -> t.appId() == 1L).map(TierChange::tier).sorted().toList());
    }

    @Test
    void workedExampleFromTheFunctionalSpec() {
        // Previous: A B C D ; current: B A E C  (A=1, B=2, C=3, D=4, E=5)
        Chart chart = new Chart();
        chart.next(T0, ranks(1, 2, 3, 4));
        Result r = chart.next(T0.plus(Duration.ofHours(1)), ranks(2, 1, 5, 3));

        assertEquals(List.of("MOVED_UP", "REACHED_NUMBER_ONE"), types(r, 2));
        assertEquals(List.of("LOST_NUMBER_ONE", "MOVED_DOWN"), types(r, 1));
        // A brand-new app at #3 is a new entry that also entered the Top 10 and Top 5.
        assertEquals(List.of("ENTERED_TOP_N_10", "ENTERED_TOP_N_5", "FIRST_OBSERVED", "NEW_ENTRY"), types(r, 5));
        assertEquals(EventType.ENTERED_TOP_N, primary(r, 5).type());
        assertEquals(List.of("MOVED_DOWN"), types(r, 3));
        assertEquals(List.of("LEFT_CHART", "LEFT_TOP_N_10", "LEFT_TOP_N_5"), types(r, 4));
        assertEquals(60, r.coveredMinutes());
        assertFalse(r.gap());
    }

    @Test
    void jumpFromTwelveToOneHasOnePrimaryEvent() {
        Chart chart = new Chart();
        long[] before = seq(1, 30);           // app 12 at #12
        chart.next(T0, ranks(before));
        long[] after = new long[30];
        after[0] = 12;
        int i = 1;
        for (long id : before) if (id != 12) after[i++] = id;
        Result r = chart.next(T0.plus(Duration.ofHours(1)), ranks(after));

        assertEquals(List.of("BIG_MOVE", "ENTERED_TOP_N_10", "ENTERED_TOP_N_5", "MOVED_UP", "REACHED_NUMBER_ONE"),
                types(r, 12));
        assertEquals(EventType.REACHED_NUMBER_ONE, primary(r, 12).type());
        assertEquals(1, r.events().stream().filter(e -> e.appId() == 12 && e.primary()).count());
        // Old #1 lost it; old #10 dropped to #11 and left the Top 10.
        assertEquals(EventType.LOST_NUMBER_ONE, primary(r, 1).type());
        assertTrue(types(r, 10).contains("LEFT_TOP_N_10"));
    }

    @Test
    void newEntryVersusReEntry() {
        Chart chart = new Chart();
        chart.next(T0, ranks(seq(1, 30)));                                   // app 26 at #26
        long[] up = seq(1, 30);
        up[24] = 26; up[25] = 25;                                            // 26 enters at #25
        Result entered = chart.next(T0.plus(Duration.ofHours(1)), ranks(up));
        assertTrue(types(entered, 26).contains("NEW_ENTRY"));
        assertTrue(types(entered, 25).contains("LEFT_CHART"));

        Result back = chart.next(T0.plus(Duration.ofHours(2)), ranks(seq(1, 30)));   // 25 returns
        assertTrue(types(back, 25).contains("RE_ENTRY"));
        assertTrue(types(back, 26).contains("LEFT_CHART"));
    }

    @Test
    void leftChartCarriesNewRankWhenStillObserved() {
        Chart chart = new Chart();
        chart.next(T0, ranks(seq(1, 40)));
        long[] after = seq(1, 40);
        // app 20 falls to #31
        long[] moved = new long[40];
        int k = 0;
        for (long id : after) if (id != 20) moved[k++] = id;
        System.arraycopy(moved, 30, moved, 31, 9);
        moved[30] = 20;
        Result r = chart.next(T0.plus(Duration.ofHours(1)), ranks(moved));
        Event left = r.events().stream().filter(e -> e.appId() == 20 && e.type() == EventType.LEFT_CHART)
                .findFirst().orElseThrow();
        assertEquals(20, left.previousRank());
        assertEquals(31, left.currentRank());
        assertTrue(types(r, 20).contains("BIG_MOVE"));

        // Falling out of the collected depth entirely: no new rank.
        Result gone = chart.next(T0.plus(Duration.ofHours(2)), ranks(seq(1, 19)));
        Event left2 = gone.events().stream().filter(e -> e.appId() == 19 && e.type() == EventType.LEFT_CHART)
                .findFirst().orElse(null);
        assertNull(left2, "app 19 is still #19");
        Event leftFar = gone.events().stream().filter(e -> e.appId() == 21 && e.type() == EventType.LEFT_CHART)
                .findFirst().orElseThrow();
        assertNull(leftFar.currentRank());
        assertNull(gone.states().get(21L).currentRank());
    }

    @Test
    void gapIsFlaggedAndHeldTiersMarked() {
        Chart chart = new Chart();
        chart.next(T0, ranks(seq(1, 30)));
        Result r = chart.next(T0.plus(Duration.ofHours(5)), ranks(seq(1, 30)));
        assertEquals(300, r.coveredMinutes());
        assertTrue(r.gap());
        assertTrue(r.tiersHeldOverGap().stream().anyMatch(t -> t.appId() == 1 && t.tier() == 1));
        assertTrue(r.events().isEmpty(), "nothing moved");
    }

    @Test
    void steadyDailyClimbIsRisingWithDefaults() {
        Chart chart = new Chart();
        long app = 7;
        boolean risingAtEnd = false;
        for (int h = 0; h <= 30; h++) {               // 60 → 30, one place every hour
            Map<Long, Integer> current = new LinkedHashMap<>();
            current.put(app, 60 - h);
            risingAtEnd = chart.next(T0.plus(Duration.ofHours(h)), current).states().get(app).rising();
        }
        assertTrue(risingAtEnd);
        assertEquals(EventType.Importance.LOW, EventType.NEW_BEST.importance());
    }

    @Test
    void steadyClimbOverADayIsRisingAtAFourHourInterval() {
        // Every 4 hours: a day is 6 steps; 3 gains and 10 places are enough.
        Chart chart = new Chart(engine, 240);
        long app = 8;
        int[] path = {70, 66, 66, 61, 58, 58, 55};
        boolean rising = false;
        for (int step = 0; step < path.length; step++) {
            Map<Long, Integer> current = new LinkedHashMap<>();
            current.put(app, path[step]);
            rising = chart.next(T0.plus(Duration.ofHours(4L * step)), current).states().get(app).rising();
        }
        assertTrue(rising, "70 → 55 over a day, 4 of 6 steps up");
    }

    @Test
    void risingStartsAndEnds() {
        // Short window to keep the test readable: 4 hourly steps, 3 of them up (75%), 6 places net.
        Chart chart = new Chart(new EventEngine(new Config(25, List.of(10, 5), 5, 4, 75, 6, 7, 3, 8)));
        long app = 99;
        int[] path = {40, 35, 30, 28, 22, 23, 23, 23, 23};
        Result last = null;
        boolean started = false;
        boolean ended = false;
        for (int step = 0; step < path.length; step++) {
            Map<Long, Integer> current = new LinkedHashMap<>();
            current.put(app, path[step]);
            last = chart.next(T0.plus(Duration.ofHours(step)), current);
            if (types(last, app).contains("RISING_STARTED")) started = true;
            if (types(last, app).contains("RISING_ENDED")) ended = true;
        }
        assertTrue(started, "40→35→30→28→22 is rising");
        assertTrue(ended, "flat afterwards ends it");
        assertFalse(last.states().get(app).rising());
    }

    @Test
    void newBestOnlyAfterBaselinePeriod() {
        Chart chart = new Chart();
        Map<Long, Integer> at10 = new LinkedHashMap<>(); at10.put(5L, 10);
        Map<Long, Integer> at8 = new LinkedHashMap<>(); at8.put(5L, 8);
        Map<Long, Integer> at3 = new LinkedHashMap<>(); at3.put(5L, 3);
        chart.next(T0, at10);
        Result early = chart.next(T0.plus(Duration.ofDays(1)), at8);
        assertFalse(types(early, 5).contains("NEW_BEST"));
        Result later = chart.next(T0.plus(Duration.ofDays(8)), at3);
        assertTrue(types(later, 5).contains("NEW_BEST"));
        // NEW_BEST is low importance: entering the Top 5 (8 → 3) is the primary event.
        assertEquals(EventType.ENTERED_TOP_N, primary(later, 5).type());
        assertEquals(3, later.states().get(5L).bestRank());
        assertEquals(10, later.states().get(5L).worstRank());
    }

    @Test
    void tierIntervalsOpenAndClose() {
        Chart chart = new Chart();
        chart.next(T0, ranks(seq(1, 12)));                      // app 11 at #11
        long[] up = {11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12};    // app 11 to #1
        Result r = chart.next(T0.plus(Duration.ofHours(1)), ranks(up));
        List<String> changes11 = r.tierChanges().stream().filter(t -> t.appId() == 11)
                .map(t -> t.action() + "_" + t.tier()).sorted().toList();
        assertEquals(List.of("OPEN_1", "OPEN_10", "OPEN_5"), changes11);
        assertTrue(r.tierChanges().stream().anyMatch(t ->
                t.appId() == 1 && t.tier() == 1 && t.action() == TierAction.CLOSE));
    }

    @Test
    void recentRanksRoundTrip() {
        List<Integer> ranks = java.util.Arrays.asList(12, null, 7);
        AppState s = new AppState(1, 7, true, true, T0, 7, T0, 12, T0, T0, ranks, false);
        assertEquals("12,-,7", s.recentRanksText());
        assertEquals(ranks, AppState.parseRecentRanks("12,-,7"));
        assertEquals(List.of(), AppState.parseRecentRanks(""));
    }
}
