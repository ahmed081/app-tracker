package com.apptracker.watch;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Which events of an app watch become alerts. Three presets: IMPORTANT (the
 * default), ALL, and CUSTOM with its own event types, minimum move and tiers.
 *
 * @param eventTypes CUSTOM only: the event types to alert on
 * @param minPlaces  CUSTOM only: smallest BIG_MOVE / MOVED_UP / MOVED_DOWN that counts (default 10)
 * @param tiers      CUSTOM only: tiers that count for ENTERED_TOP_N / LEFT_TOP_N; null = every configured tier
 */
public record AlertRule(String preset, List<String> eventTypes, Integer minPlaces, List<Integer> tiers) {

    public static final String IMPORTANT = "IMPORTANT";
    public static final String ALL = "ALL";
    public static final String CUSTOM = "CUSTOM";
    public static final List<String> PRESETS = List.of(IMPORTANT, ALL, CUSTOM);

    public static final List<String> IMPORTANT_TYPES =
            List.of("REACHED_NUMBER_ONE", "LOST_NUMBER_ONE", "ENTERED_TOP_N", "LEFT_TOP_N", "LEFT_CHART");
    public static final List<String> ALL_TYPES = List.of("REACHED_NUMBER_ONE", "LOST_NUMBER_ONE", "ENTERED_TOP_N",
            "LEFT_TOP_N", "LEFT_CHART", "BIG_MOVE", "RISING_STARTED", "NEW_ENTRY", "RE_ENTRY", "NEW_VERSION");
    /** What CUSTOM can pick from: everything in ALL, plus the small moves. */
    public static final List<String> CUSTOM_CHOICES = List.of("REACHED_NUMBER_ONE", "LOST_NUMBER_ONE", "ENTERED_TOP_N",
            "LEFT_TOP_N", "LEFT_CHART", "BIG_MOVE", "RISING_STARTED", "NEW_ENTRY", "RE_ENTRY", "NEW_VERSION",
            "MOVED_UP", "MOVED_DOWN");
    public static final int DEFAULT_MIN_PLACES = 10;

    public static AlertRule important() {
        return new AlertRule(IMPORTANT, null, null, null);
    }

    /** Problems per field, empty when valid. Same limits as the database CHECKs. */
    public Map<String, String> validate(List<Integer> configuredTiers) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (preset == null || !PRESETS.contains(preset)) {
            errors.put("preset", "One of " + PRESETS);
            return errors;
        }
        if (!CUSTOM.equals(preset)) return errors;
        if (eventTypes == null || eventTypes.isEmpty()) {
            errors.put("eventTypes", "Pick at least one event type");
        } else if (!CUSTOM_CHOICES.containsAll(eventTypes)) {
            errors.put("eventTypes", "Among " + CUSTOM_CHOICES);
        }
        if (minPlaces != null && (minPlaces < 1 || minPlaces > 200)) errors.put("minPlaces", "Must be between 1 and 200");
        if (tiers != null && (tiers.isEmpty() || !configuredTiers.containsAll(tiers))) {
            errors.put("tiers", "Among the configured tiers " + configuredTiers);
        }
        return errors;
    }

    /** What is stored: presets keep no settings; CUSTOM gets its defaults and no duplicates. */
    public AlertRule normalized() {
        if (!CUSTOM.equals(preset)) return new AlertRule(preset, null, null, null);
        return new AlertRule(CUSTOM, eventTypes.stream().distinct().toList(),
                minPlaces == null ? DEFAULT_MIN_PLACES : minPlaces,
                tiers == null ? null : tiers.stream().distinct().sorted().toList());
    }
}
