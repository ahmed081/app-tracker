package com.apptracker.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiHelpersTest {

    @Test
    void parsesWindows() {
        assertEquals(60, TimeWindow.parse("1h", "24h").minutes());
        assertEquals(1440, TimeWindow.parse("24h", "24h").minutes());
        assertEquals(7 * 1440, TimeWindow.parse("7D", "24h").minutes());
        assertEquals(90 * 1440, TimeWindow.parse("3m", "24h").minutes());
        assertEquals(1440, TimeWindow.parse(null, "24h").minutes());
        assertEquals("all", TimeWindow.parse("all", "24h").label());
        assertEquals(60, TimeWindow.parse("7d", "24h").defaultStepMinutes());
        assertEquals(360, TimeWindow.parse("30d", "24h").defaultStepMinutes());
        assertEquals(1440, TimeWindow.parse("1y", "24h").defaultStepMinutes());
    }

    @Test
    void stepIsNeverShorterThanTheChartInterval() {
        TimeWindow week = TimeWindow.parse("7d", "24h");
        assertEquals(60, week.stepMinutes(null, 60));
        assertEquals(240, week.stepMinutes(null, 240));      // 4-hourly chart: no empty hourly buckets
        assertEquals(240, week.stepMinutes(60, 240));
        assertEquals(360, TimeWindow.parse("30d", "24h").stepMinutes(null, 240));
    }

    @Test
    void rejectsBadWindows() {
        for (String bad : new String[]{"x", "10", "-1d", "5q", "h"}) {
            boolean threw = false;
            try {
                TimeWindow.parse(bad, "24h");
            } catch (IllegalArgumentException e) {
                threw = true;
            }
            assertTrue(threw, bad + " should be rejected");
        }
    }

    @Test
    void statusVersusEarlierRank() {
        assertEquals("NEW", QueryService.status(null, 4));
        assertEquals("UP", QueryService.status(9, 4));
        assertEquals("DOWN", QueryService.status(2, 4));
        assertEquals("SAME", QueryService.status(4, 4));
    }

    @Test
    void eventSentences() {
        assertEquals("Tongits Go entered the Top 10 (#12 → #8)",
                EventText.describe("ENTERED_TOP_N", 10, 12, 8, "Tongits Go"));
        assertEquals("Tongits Go reached #1 (from #3)", EventText.describe("REACHED_NUMBER_ONE", 1, 3, 1, "Tongits Go"));
        assertEquals("ArionPlay left the chart (now #31), was #24", EventText.describe("LEFT_CHART", null, 24, 31, "ArionPlay"));
        assertEquals("ArionPlay left the chart, was #24", EventText.describe("LEFT_CHART", null, 24, null, "ArionPlay"));
        assertEquals("An app entered the chart at #17", EventText.describe("NEW_ENTRY", null, null, 17, null));
    }
}
