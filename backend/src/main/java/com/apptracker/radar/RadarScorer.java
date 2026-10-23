package com.apptracker.radar;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Reasons and score of a Radar candidate. Pure: the service gathers the facts,
 * this decides. Works in time, not in a number of readings, so it means the
 * same at any collection interval.
 */
public final class RadarScorer {

    private RadarScorer() {
    }

    static final int NEW_APP_DAYS = 90;
    static final int CLIMBING_PLACES = 10;
    static final int STEADY_PERCENT = 60;
    static final int STEADY_MIN_READINGS = 4;
    static final int RATINGS_PERCENT = 30;
    static final int RATINGS_MIN_GAIN = 20;
    static final int FAST_TOP_PERCENT = 10;
    static final int MULTI_COUNTRY_MIN = 2;
    /** Apps seen within this time of a chart's first reading were already there: not new. */
    public static final Duration WARM_UP = Duration.ofHours(48);

    /** One VALID reading of a chart in which the app is ranked. */
    public record Reading(Instant at, int rank) {
    }

    /**
     * Steps between consecutive readings of one chart. Steps longer than
     * gapFactor × interval follow an outage and are not counted.
     */
    public record Steps(int readings, int steps, int improved) {

        public static final Steps NONE = new Steps(0, 0, 0);

        public static Steps of(List<Reading> readings, int intervalMinutes, int gapFactor) {
            Duration gap = Duration.ofMinutes((long) intervalMinutes * gapFactor);
            int steps = 0;
            int improved = 0;
            for (int i = 1; i < readings.size(); i++) {
                Reading a = readings.get(i - 1);
                Reading b = readings.get(i);
                if (Duration.between(a.at(), b.at()).compareTo(gap) > 0) continue;
                steps++;
                if (b.rank() < a.rank()) improved++;
            }
            return new Steps(readings.size(), steps, improved);
        }

        public boolean steady() {
            return readings >= STEADY_MIN_READINGS && steps > 0 && improved * 100 >= STEADY_PERCENT * steps;
        }
    }

    /**
     * Where an app went in one chart over the period.
     *
     * @param startRank    rank in the chart's first reading of the period (null = not ranked)
     * @param currentRank  rank in the chart's latest reading (null = not ranked now)
     * @param placesGained first rank of the period minus the current rank; null when not ranked now
     * @param bottomToTop  in the bottom half at the start of the period, in the top half now
     */
    public record Move(Integer startRank, Integer currentRank, Integer placesGained, boolean bottomToTop, Steps steps) {

        /**
         * @param readings  the app's readings in the period, oldest first
         * @param periodStartReading time of the chart's first reading in the period
         * @param latestReading      time of the chart's latest reading
         * @param depth     entries the chart really has (e.g. 100 when 200 are asked for)
         */
        public static Move of(List<Reading> readings, Instant periodStartReading, Instant latestReading, int depth,
                              int intervalMinutes, int gapFactor) {
            if (readings.isEmpty()) return new Move(null, null, null, false, Steps.NONE);
            Reading first = readings.get(0);
            Reading last = readings.get(readings.size() - 1);
            Integer start = first.at().equals(periodStartReading) ? first.rank() : null;
            Integer current = last.at().equals(latestReading) ? last.rank() : null;
            Integer gained = current == null ? null : first.rank() - current;
            int half = depth / 2;
            boolean bottomToTop = start != null && current != null && start > half && current <= half;
            return new Move(start, current, gained, bottomToTop, Steps.of(readings, intervalMinutes, gapFactor));
        }
    }

    /**
     * What the scorer needs to know about an app.
     *
     * @param ratingsStart rating count at the start of the 7 days; null when fewer than 2 daily rows
     * @param ratingsFast  in the top 10% of rating growth (see {@link #fastest})
     * @param countries    enabled countries the app ranks in now
     */
    public record Facts(
            LocalDate releaseDate,
            boolean newInCharts,
            Move move,
            Integer ratingsStart,
            Integer ratingsEnd,
            boolean ratingsFast,
            boolean unknownTheme,
            boolean hasFollowers,
            int countries,
            boolean newDeveloper) {
    }

    /** The reasons that apply, in chip order. */
    public static List<Reason> reasons(Facts f, LocalDate today) {
        Set<Reason> r = EnumSet.noneOf(Reason.class);
        if (f.releaseDate() != null && !f.releaseDate().isBefore(today.minusDays(NEW_APP_DAYS))) r.add(Reason.NEW_APP);
        if (f.newInCharts()) r.add(Reason.NEW_IN_CHARTS);
        Move m = f.move();
        if (m != null && ((m.placesGained() != null && m.placesGained() >= CLIMBING_PLACES) || m.bottomToTop())) {
            r.add(Reason.CLIMBING);
        }
        if (m != null && m.steps().steady()) r.add(Reason.STEADY);
        if (ratingsGrowing(f.ratingsStart(), f.ratingsEnd())) r.add(Reason.RATINGS_GROWING);
        if (f.ratingsFast()) r.add(Reason.RATINGS_FAST);
        if (f.unknownTheme()) r.add(Reason.UNKNOWN_THEME);
        if (f.hasFollowers()) r.add(Reason.HAS_FOLLOWERS);
        if (f.countries() >= MULTI_COUNTRY_MIN) r.add(Reason.MULTI_COUNTRY);
        if (f.newDeveloper()) r.add(Reason.NEW_DEVELOPER);
        return List.copyOf(r);
    }

    public static int score(List<Reason> reasons) {
        return reasons.stream().mapToInt(r -> r.points).sum();
    }

    /** +30% and +20 ratings or more. A start of 0 needs only the +20. */
    public static boolean ratingsGrowing(Integer start, Integer end) {
        if (start == null || end == null) return false;
        int gain = end - start;
        return gain >= RATINGS_MIN_GAIN && gain * 100L >= (long) RATINGS_PERCENT * start;
    }

    /** Growth in percent; null without data or from 0. */
    public static Double growthPercent(Integer start, Integer end) {
        if (start == null || end == null || start == 0) return null;
        return Math.round((end - start) * 1000.0 / start) / 10.0;
    }

    /** The apps whose rating gain (ratings over 7 days) is in the top 10%; a gain of 0 never counts. */
    public static <K> Set<K> fastest(Map<K, Integer> gains) {
        if (gains.isEmpty()) return Set.of();
        List<Integer> sorted = new ArrayList<>(gains.values());
        sorted.sort(Collections.reverseOrder());
        int k = Math.max(1, (int) Math.ceil(sorted.size() * FAST_TOP_PERCENT / 100.0));
        int threshold = Math.max(1, sorted.get(k - 1));
        return gains.entrySet().stream().filter(e -> e.getValue() >= threshold)
                .map(Map.Entry::getKey).collect(Collectors.toSet());
    }

    /**
     * New = first seen within the period, and more than the warm-up after the
     * first reading of the data it was seen in (a chart, or the whole tracker).
     * Without that, every app would look new until the history is long enough.
     */
    public static boolean isNew(Instant firstSeen, Instant dataStart, Instant periodStart) {
        return firstSeen != null && dataStart != null
                && !firstSeen.isBefore(periodStart) && firstSeen.isAfter(dataStart.plus(WARM_UP));
    }
}
