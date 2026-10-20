package com.apptracker.manage;

import java.time.Instant;
import java.util.List;

/** JSON shapes of the Settings API (/api/manage). Request bodies: null = leave unchanged. */
public final class ManageModel {

    private ManageModel() {
    }

    // ------------------------------------------------------------- countries

    /** @param activeCharts charts collected in this country right now */
    public record Country(String code, String name, boolean enabled, int activeCharts) {
    }

    public record CountryCreate(String code, String name, Boolean enabled) {
    }

    public record CountryUpdate(String name, Boolean enabled) {
    }

    // ---------------------------------------------------------------- genres

    /** @param availableOnApple set by the collector's genre sync, never by the Settings menu */
    public record Genre(int id, String name, Integer parentId, boolean enabled, boolean availableOnApple) {
    }

    public record GenreUpdate(Boolean enabled) {
    }

    // -------------------------------------------------------------- tracking

    /** @param targetCharts charts this row produces right now, after every switch */
    public record Tracking(
            long id,
            int genreId,
            String genreName,
            String chartType,
            int depth,
            int intervalMinutes,
            boolean allCountries,
            boolean active,
            List<TrackingCountry> countries,
            int targetCharts) {
    }

    public record TrackingCountry(String code, boolean active) {
    }

    /** @param countries country codes to track in (ignored when allCountries is true) */
    public record TrackingCreate(
            Integer genreId,
            String chartType,
            Integer depth,
            Integer intervalMinutes,
            Boolean allCountries,
            Boolean active,
            List<String> countries) {
    }

    public record TrackingUpdate(Integer depth, Integer intervalMinutes, Boolean allCountries, Boolean active) {
    }

    public record TrackingCountryUpdate(Boolean active) {
    }

    /**
     * A whole category at once: its switch (genre.enabled), which chart types are
     * tracked, and the settings shared by all its chart types.
     *
     * @param chartTypes the chart types to track; missing rows are created, the others switched off
     * @param countries  country codes to track in; the others are switched off
     */
    public record CategoryUpdate(
            Boolean enabled,
            List<String> chartTypes,
            Integer depth,
            Integer intervalMinutes,
            Boolean allCountries,
            List<String> countries) {
    }

    // ----------------------------------------------------------------- rules

    /**
     * @param custom    true when Settings overrides the application.yml defaults
     * @param updatedAt when the custom rules were saved (null for defaults)
     */
    public record Rules(
            EventRules rules,
            EventRules defaults,
            boolean custom,
            Instant updatedAt,
            List<Integer> tierChoices) {
    }

    // ---------------------------------------------------------------- status

    public record Status(
            Instant now,
            boolean adminKeyRequired,
            Collector collector,
            Events events,
            Rebuild rebuild,
            List<ChartStatus> charts) {
    }

    /**
     * @param targetCharts       charts that should be collected now (v_tracking_target)
     * @param lastAttemptAt      the collector's latest fetch attempt, any chart
     * @param lastValidReadingAt the latest VALID reading, any chart
     */
    public record Collector(int targetCharts, Instant lastAttemptAt, Instant lastValidReadingAt) {
    }

    public record Events(int pendingSnapshots, Instant lastProcessedAt) {
    }

    /** The "recompute all events" job, which runs in the background. */
    public record Rebuild(
            boolean running,
            Instant startedAt,
            Instant finishedAt,
            int chartsDone,
            int chartsTotal,
            int snapshotsProcessed,
            String error) {

        static Rebuild idle() {
            return new Rebuild(false, null, null, 0, 0, 0, null);
        }
    }

    /**
     * @param lastStatus  VALID / INCOMPLETE / FAILED of the latest reading (null = never read)
     * @param lastReasons e.g. "below_min_entries:12" or "fetch_error:HTTP 503"
     * @param delayed     active, and no valid reading for more than 2 intervals
     */
    public record ChartStatus(
            String key,
            String country,
            String countryName,
            int genreId,
            String genreName,
            String chartType,
            boolean active,
            int intervalMinutes,
            Instant lastAttemptAt,
            Instant lastValidReadingAt,
            Instant lastSlot,
            String lastStatus,
            String lastReasons,
            Integer lastEntryCount,
            boolean delayed,
            int pendingSnapshots) {
    }
}
