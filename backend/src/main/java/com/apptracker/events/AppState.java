package com.apptracker.events;

import java.time.Instant;
import java.util.List;

/**
 * Where an app stands in one chart. Immutable; the engine returns new values.
 *
 * @param currentRank  rank in the latest snapshot, or null if below the collected depth
 * @param inChart      rank within the display depth (Top 25)
 * @param recentRanks  latest ranks, oldest first; null = absent from the snapshot
 */
public record AppState(
        long appId,
        Integer currentRank,
        boolean inChart,
        boolean everInChart,
        Instant inChartSince,
        Integer bestRank,
        Instant bestRankAt,
        Integer worstRank,
        Instant firstObservedAt,
        Instant lastSeenAt,
        List<Integer> recentRanks,
        boolean rising) {

    public AppState {
        // Copy that allows nulls (absent snapshots).
        recentRanks = java.util.Collections.unmodifiableList(
                new java.util.ArrayList<>(recentRanks == null ? List.of() : recentRanks));
    }

    /** "12,9,-,7": the format stored in app_chart_state.recent_ranks. */
    public String recentRanksText() {
        StringBuilder sb = new StringBuilder();
        for (Integer r : recentRanks) {
            if (sb.length() > 0) sb.append(',');
            sb.append(r == null ? "-" : r.toString());
        }
        return sb.toString();
    }

    public static List<Integer> parseRecentRanks(String text) {
        if (text == null || text.isBlank()) return List.of();
        return java.util.Arrays.stream(text.split(","))
                .map(s -> s.equals("-") ? null : Integer.valueOf(s))
                .collect(java.util.stream.Collectors.toList());
    }
}
