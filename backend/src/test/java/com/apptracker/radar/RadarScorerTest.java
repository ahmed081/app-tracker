package com.apptracker.radar;

import com.apptracker.radar.RadarScorer.Facts;
import com.apptracker.radar.RadarScorer.Move;
import com.apptracker.radar.RadarScorer.Reading;
import com.apptracker.radar.RadarScorer.Steps;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RadarScorerTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-10-23");
    private static final Instant T0 = Instant.parse("2026-10-09T00:00:00Z");
    private static final int TWELVE_HOURS = 720;

    /** One reading every 12 hours from T0. */
    private static List<Reading> every12h(int... ranks) {
        List<Reading> out = new ArrayList<>();
        for (int i = 0; i < ranks.length; i++) out.add(new Reading(T0.plus(Duration.ofHours(12L * i)), ranks[i]));
        return out;
    }

    private static Facts facts(LocalDate release, boolean newInCharts, Move move, Integer r0, Integer r1) {
        return new Facts(release, newInCharts, move, r0, r1, false, false, false, 1, false);
    }

    @Test
    void eachReasonAndItsPoints() {
        Move climbing = Move.of(every12h(80, 70, 60, 40), T0, T0.plus(Duration.ofHours(36)), 100, TWELVE_HOURS, 3);
        Facts all = new Facts(TODAY.minusDays(90), true, climbing, 100, 130, true, true, true, 2, true);
        List<Reason> reasons = RadarScorer.reasons(all, TODAY);
        assertEquals(List.of(Reason.values()), reasons);
        assertEquals(2 + 2 + 2 + 1 + 2 + 1 + 2 + 3 + 1 + 1, RadarScorer.score(reasons));
        assertTrue(RadarScorer.reasons(facts(TODAY.minusDays(91), false, null, null, null), TODAY).isEmpty());
    }

    @Test
    void climbingNeedsTenPlacesOrBottomToTop() {
        Instant last = T0.plus(Duration.ofHours(12));
        assertEquals(10, Move.of(every12h(40, 30), T0, last, 100, TWELVE_HOURS, 3).placesGained());
        assertFalse(RadarScorer.reasons(facts(null, false, Move.of(every12h(40, 31), T0, last, 100, TWELVE_HOURS, 3), null, null), TODAY)
                .contains(Reason.CLIMBING));
        Move halfway = Move.of(every12h(55, 50), T0, last, 100, TWELVE_HOURS, 3);
        assertTrue(halfway.bottomToTop());
        assertEquals(List.of(Reason.CLIMBING), RadarScorer.reasons(facts(null, false, halfway, null, null), TODAY));
    }

    @Test
    void theLastRanksOfTheChartAreChurnNotClimbs() {
        Instant last = T0.plus(Duration.ofHours(12));
        // 99 → 89 in a 100-entry chart: 10 places, but still in the bottom quarter.
        Move edge = Move.of(every12h(99, 89), T0, last, 100, TWELVE_HOURS, 3);
        assertEquals(10, edge.placesGained());
        assertFalse(edge.reachedBody());
        assertFalse(RadarScorer.reasons(facts(null, false, edge, null, null), TODAY).contains(Reason.CLIMBING));
        // 90 → 75 ends in the body (top 75%).
        Move body = Move.of(every12h(90, 75), T0, last, 100, TWELVE_HOURS, 3);
        assertTrue(body.reachedBody());
        assertTrue(RadarScorer.reasons(facts(null, false, body, null, null), TODAY).contains(Reason.CLIMBING));
        // Reached rank 70 once, then fell back: it was in the body.
        assertTrue(Move.of(every12h(95, 70, 96), T0, T0.plus(Duration.ofHours(24)), 100, TWELVE_HOURS, 3).reachedBody());
    }

    @Test
    void movesKnowWhenTheAppIsMissingAtEitherEnd() {
        Instant last = T0.plus(Duration.ofHours(36));
        // Entered after the period's first reading: gains count from its first rank, never bottom to top.
        Move entered = Move.of(every12h(90, 60).stream().map(r -> new Reading(r.at().plus(Duration.ofHours(24)), r.rank())).toList(),
                T0, last, 100, TWELVE_HOURS, 3);
        assertNull(entered.startRank());
        assertEquals(30, entered.placesGained());
        assertFalse(entered.bottomToTop());
        // Not in the latest reading: no gain.
        Move left = Move.of(every12h(20, 30), T0, last, 100, TWELVE_HOURS, 3);
        assertNull(left.currentRank());
        assertNull(left.placesGained());
    }

    @Test
    void steadyWithTwelveHourReadings() {
        // 3 gains out of 4 steps = 75%, 5 readings.
        assertTrue(Steps.of(every12h(90, 80, 82, 70, 60), TWELVE_HOURS, 3).steady());
        // 3 readings are not enough, whatever the gains.
        assertFalse(Steps.of(every12h(90, 80, 70), TWELVE_HOURS, 3).steady());
        // 2 of 4 = 50%.
        assertFalse(Steps.of(every12h(90, 80, 85, 86, 70), TWELVE_HOURS, 3).steady());
    }

    @Test
    void stepsAfterAnOutageAreIgnored() {
        List<Reading> r = new ArrayList<>(every12h(50, 49, 48));
        r.add(new Reading(T0.plus(Duration.ofDays(5)), 60));           // 4 days later: a gap, the drop doesn't count
        r.add(new Reading(T0.plus(Duration.ofDays(5).plusHours(12)), 59));
        Steps s = Steps.of(r, TWELVE_HOURS, 3);
        assertEquals(new Steps(5, 3, 3), s);
        assertTrue(s.steady());
    }

    @Test
    void ratings() {
        assertTrue(RadarScorer.ratingsGrowing(100, 130));
        assertFalse(RadarScorer.ratingsGrowing(100, 129));               // +29%
        assertFalse(RadarScorer.ratingsGrowing(10, 25));                 // +150% but only +15 ratings
        assertTrue(RadarScorer.ratingsGrowing(0, 20));
        assertFalse(RadarScorer.ratingsGrowing(null, 500));              // fewer than 2 daily rows: no reason, no error
        assertEquals(30.0, RadarScorer.growthPercent(100, 130));
        assertNull(RadarScorer.growthPercent(0, 20));
    }

    @Test
    void fastestIsTheTopTenPercent() {
        Map<Long, Integer> gains = new java.util.HashMap<>();
        for (long i = 1; i <= 20; i++) gains.put(i, (int) i * 10);
        assertEquals(Set.of(19L, 20L), RadarScorer.fastest(gains));
        assertEquals(Set.of(), RadarScorer.fastest(Map.of(1L, 0, 2L, 0)));
        assertEquals(Set.of(), RadarScorer.fastest(Map.<Long, Integer>of()));
    }

    @Test
    void newMeansAfterTheWarmUp() {
        Instant dataStart = Instant.parse("2026-10-19T11:00:00Z");
        Instant periodStart = Instant.parse("2026-10-09T00:00:00Z");
        assertFalse(RadarScorer.isNew(dataStart.plus(Duration.ofHours(4)), dataStart, periodStart));
        assertFalse(RadarScorer.isNew(dataStart.plus(Duration.ofHours(48)), dataStart, periodStart));
        assertTrue(RadarScorer.isNew(dataStart.plus(Duration.ofHours(52)), dataStart, periodStart));
        // Long history: first seen before the period is not new.
        assertFalse(RadarScorer.isNew(Instant.parse("2026-09-01T00:00:00Z"), Instant.parse("2026-01-01T00:00:00Z"), periodStart));
        assertFalse(RadarScorer.isNew(null, dataStart, periodStart));
    }

    @Test
    void thePeriodIsANumberOfDays() {
        assertEquals("4d", RadarService.window(null));
        assertEquals("14d", RadarService.window(" 14D "));
        assertEquals("90d", RadarService.window("90d"));
        assertNull(RadarService.window("91d"));
        assertNull(RadarService.window("0d"));
        assertNull(RadarService.window("2w"));
        assertNull(RadarService.window("abc"));
    }
}
