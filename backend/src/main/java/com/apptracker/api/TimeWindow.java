package com.apptracker.api;

import java.util.Locale;

/** Windows and ranges such as "1h", "24h", "7d", "30d", "3m", "1y", "all". */
public record TimeWindow(String label, int minutes) {

    public static final int ALL_MINUTES = 100 * 365 * 24 * 60;

    public static TimeWindow parse(String value, String fallback) {
        String v = (value == null || value.isBlank() ? fallback : value).trim().toLowerCase(Locale.ROOT);
        if (v.equals("all")) return new TimeWindow("all", ALL_MINUTES);
        if (v.length() < 2) throw new IllegalArgumentException("Invalid window: " + value);
        int n;
        try {
            n = Integer.parseInt(v.substring(0, v.length() - 1));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid window: " + value + " (use e.g. 1h, 24h, 7d, 30d, 3m, 1y, all)");
        }
        if (n <= 0) throw new IllegalArgumentException("Invalid window: " + value);
        int minutes = switch (v.charAt(v.length() - 1)) {
            case 'h' -> n * 60;
            case 'd' -> n * 24 * 60;
            case 'w' -> n * 7 * 24 * 60;
            case 'm' -> n * 30 * 24 * 60;
            case 'y' -> n * 365 * 24 * 60;
            default -> throw new IllegalArgumentException("Invalid window: " + value + " (use h, d, w, m or y)");
        };
        return new TimeWindow(v, minutes);
    }

    /** Point spacing that keeps graphs around 100-200 points. */
    public int defaultStepMinutes() {
        if (minutes <= 2 * 24 * 60) return 60;            // up to 2 days: hourly
        if (minutes <= 8 * 24 * 60) return 60;            // a week: hourly (~168 points)
        if (minutes <= 31 * 24 * 60) return 6 * 60;       // a month: every 6 hours
        return 24 * 60;                                   // longer: daily
    }
}
