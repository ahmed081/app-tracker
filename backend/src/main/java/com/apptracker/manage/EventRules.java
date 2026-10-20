package com.apptracker.manage;

import com.apptracker.events.EngineModel;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The event rules editable from the Settings menu. Everything else in
 * {@link EngineModel.Config} (display depth, gap factor...) stays in application.yml.
 */
public record EventRules(
        List<Integer> tiers,
        int bigMovePlaces,
        int risingHours,
        int risingGainPercent,
        int risingMinNetPlaces,
        int newBestAfterDays) {

    /** Tier lines users can pick. App pages show time spent in the Top 5 and Top 10. */
    public static final List<Integer> TIER_CHOICES = List.of(3, 5, 10, 20);

    public static EventRules of(EngineModel.Config c) {
        return new EventRules(c.tiers(), c.bigMovePlaces(), c.risingHours(), c.risingGainPercent(),
                c.risingMinNetPlaces(), c.newBestAfterDays());
    }

    /** These rules on top of the other (non-editable) settings of {@code base}. */
    public EngineModel.Config applyTo(EngineModel.Config base) {
        List<Integer> sorted = tiers.stream().distinct().sorted((a, b) -> b - a).toList();
        return new EngineModel.Config(base.displayDepth(), sorted, bigMovePlaces, risingHours, risingGainPercent,
                risingMinNetPlaces, newBestAfterDays, base.gapFactor(), base.recentRanksKept());
    }

    /** Field → message for every invalid value; empty when the rules are valid. */
    public Map<String, String> validate() {
        Map<String, String> errors = new LinkedHashMap<>();
        if (tiers == null || tiers.isEmpty()) {
            errors.put("tiers", "Pick at least one tier");
        } else if (!TIER_CHOICES.containsAll(tiers)) {
            errors.put("tiers", "Tiers must be among " + TIER_CHOICES);
        }
        range(errors, "bigMovePlaces", bigMovePlaces, 2, 50);
        range(errors, "risingHours", risingHours, 2, 168);
        range(errors, "risingGainPercent", risingGainPercent, 1, 100);
        range(errors, "risingMinNetPlaces", risingMinNetPlaces, 1, 200);
        range(errors, "newBestAfterDays", newBestAfterDays, 0, 90);
        return errors;
    }

    private static void range(Map<String, String> errors, String field, int value, int min, int max) {
        if (value < min || value > max) errors.put(field, "Must be between " + min + " and " + max);
    }
}
