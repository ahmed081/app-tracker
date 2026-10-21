package com.apptracker.watch;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AlertRuleTest {

    private static final List<Integer> TIERS = List.of(10, 5);

    @Test
    void presetsNeedNoSettingsAndKeepNone() {
        assertTrue(AlertRule.important().validate(TIERS).isEmpty());
        AlertRule all = new AlertRule("ALL", List.of("MOVED_UP"), 3, List.of(5)).normalized();
        assertEquals(new AlertRule("ALL", null, null, null), all);
        assertTrue(new AlertRule("NOPE", null, null, null).validate(TIERS).containsKey("preset"));
    }

    @Test
    void customChecksItsSettings() {
        var errors = new AlertRule("CUSTOM", List.of("FIRST_OBSERVED"), 0, List.of(20)).validate(TIERS);
        assertEquals(List.of("eventTypes", "minPlaces", "tiers"), List.copyOf(errors.keySet()));
        assertTrue(new AlertRule("CUSTOM", List.of(), null, null).validate(TIERS).containsKey("eventTypes"));
        assertTrue(new AlertRule("CUSTOM", List.of("MOVED_UP"), null, List.of()).validate(TIERS).containsKey("tiers"));
        assertTrue(new AlertRule("CUSTOM", List.of("MOVED_UP", "NEW_VERSION"), 200, List.of(5)).validate(TIERS).isEmpty());
    }

    @Test
    void customGetsDefaults() {
        AlertRule r = new AlertRule("CUSTOM", List.of("BIG_MOVE", "BIG_MOVE"), null, List.of(10, 5)).normalized();
        assertEquals(List.of("BIG_MOVE"), r.eventTypes());
        assertEquals(AlertRule.DEFAULT_MIN_PLACES, r.minPlaces());
        assertEquals(List.of(5, 10), r.tiers());
        assertNull(new AlertRule("CUSTOM", List.of("BIG_MOVE"), 4, null).normalized().tiers());   // null = every tier
    }

    @Test
    void chartBigMomentsFollowTheHighestTier() {
        assertTrue(BigMoments.matches("REACHED_NUMBER_ONE", null, 1, 10));
        assertTrue(BigMoments.matches("ENTERED_TOP_N", 10, 8, 10));
        assertFalse(BigMoments.matches("ENTERED_TOP_N", 5, 4, 10));
        assertTrue(BigMoments.matches("ENTERED_TOP_N", 20, 18, BigMoments.highestTier(List.of(5, 20))));
        assertTrue(BigMoments.matches("NEW_ENTRY", null, 10, 10));
        assertFalse(BigMoments.matches("NEW_ENTRY", null, 11, 10));
        assertFalse(BigMoments.matches("BIG_MOVE", null, 2, 10));
    }

    @Test
    void arrayLiterals() {
        assertEquals("{BIG_MOVE,NEW_ENTRY}", WatchRepository.arrayLiteral(List.of("BIG_MOVE", "NEW_ENTRY")));
        assertEquals("{}", WatchRepository.arrayLiteral(List.of()));
        assertNull(WatchRepository.arrayLiteral(null));
    }
}
