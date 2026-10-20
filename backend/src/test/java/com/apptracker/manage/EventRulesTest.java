package com.apptracker.manage;

import com.apptracker.config.AppProperties;
import com.apptracker.events.EngineModel;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventRulesTest {

    private static final EngineModel.Config DEFAULTS = EngineModel.Config.defaults();

    private static EventRules valid() {
        return new EventRules(List.of(10, 5), 5, 24, 50, 10, 7);
    }

    @Test
    void defaultsAreValid() {
        assertTrue(EventRules.of(DEFAULTS).validate().isEmpty());
        assertTrue(valid().validate().isEmpty());
    }

    @Test
    void rejectsOutOfRangeValues() {
        var errors = new EventRules(List.of(), 1, 1, 101, 0, 91).validate();
        assertEquals(List.of("tiers", "bigMovePlaces", "risingHours", "risingGainPercent", "risingMinNetPlaces",
                "newBestAfterDays"), List.copyOf(errors.keySet()));
    }

    @Test
    void tiersMustBeAmongTheChoices() {
        assertTrue(new EventRules(List.of(10, 7), 5, 24, 50, 10, 7).validate().containsKey("tiers"));
        assertTrue(new EventRules(List.of(3, 5, 10, 20), 5, 24, 50, 10, 7).validate().isEmpty());
    }

    @Test
    void risingPeriodBecomesReadingsPerInterval() {
        EngineModel.Config c = EngineModel.Config.defaults();       // 24 hours, half of them gains
        assertEquals(24, c.risingSteps(60));
        assertEquals(12, c.risingMinGains(24));
        assertEquals(6, c.risingSteps(240));                         // every 4 hours
        assertEquals(3, c.risingMinGains(6));
        assertEquals(2, c.risingSteps(1440));                        // daily: at least 2 steps
        assertEquals(24, c.risingSteps(5));                          // capped by the ranks remembered
    }

    @Test
    void appliesOnlyTheEditableRules() {
        EngineModel.Config base = new EngineModel.Config(25, List.of(10, 5), 5, 24, 50, 10, 7, 3, 25);
        EngineModel.Config c = new EventRules(List.of(5, 20, 5), 8, 12, 75, 4, 0).applyTo(base);
        assertEquals(List.of(20, 5), c.tiers());               // sorted, duplicates dropped
        assertEquals(8, c.bigMovePlaces());
        assertEquals(12, c.risingHours());
        assertEquals(75, c.risingGainPercent());
        assertEquals(4, c.risingMinNetPlaces());
        assertEquals(0, c.newBestAfterDays());
        assertEquals(25, c.displayDepth());                    // not editable: kept
        assertEquals(3, c.gapFactor());
        assertEquals(List.of(1, 5, 20, 25), c.intervalTiers());
    }

    @Test
    void savedRowsMissingFieldsKeepTheDefaults() {
        AppProperties props = new AppProperties("", List.of(), null, null, new AppProperties.Events(
                true, 60000, 25, List.of(10, 5), 5, 24, 50, 10, 7, 3, 25));
        RulesStore store = new RulesStore(null, Clock.systemUTC(), props);
        EventRules r = store.parse("{\"bigMovePlaces\": 9, \"unknownField\": true}");
        assertEquals(9, r.bigMovePlaces());
        assertEquals(List.of(10, 5), r.tiers());
        assertEquals(24, r.risingHours());
    }
}
