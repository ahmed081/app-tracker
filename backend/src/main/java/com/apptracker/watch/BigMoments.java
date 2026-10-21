package com.apptracker.watch;

import java.util.List;

/**
 * What a chart watch reports: a new #1, an app entering the chart's highest
 * configured tier, and an app entering the chart straight into that tier.
 */
public final class BigMoments {

    private BigMoments() {
    }

    public static final List<String> TYPES = List.of("REACHED_NUMBER_ONE", "ENTERED_TOP_N", "NEW_ENTRY");

    /** @param highestTier the largest tier in the event rules (10 by default) */
    public static boolean matches(String type, Integer tier, Integer currentRank, int highestTier) {
        return switch (type) {
            case "REACHED_NUMBER_ONE" -> true;
            case "ENTERED_TOP_N" -> tier != null && tier == highestTier;
            case "NEW_ENTRY" -> currentRank != null && currentRank <= highestTier;
            default -> false;
        };
    }

    public static int highestTier(List<Integer> tiers) {
        return tiers.stream().max(Integer::compare).orElse(10);
    }
}
