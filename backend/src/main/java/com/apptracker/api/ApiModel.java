package com.apptracker.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** JSON shapes returned by the API. */
public final class ApiModel {

    private ApiModel() {
    }

    /**
     * @param asOf    time of the latest processed reading shown by the API
     * @param delayed true when no valid reading arrived for more than 2 intervals
     */
    public record Chart(
            String key,
            String country,
            String countryName,
            int genreId,
            String genreName,
            String chartType,
            boolean active,
            int intervalMinutes,
            Instant asOf,
            Instant lastValidReadingAt,
            Instant lastAttemptAt,
            boolean delayed) {
    }

    /** Identity and display fields of an app, in the chart's country. */
    public record AppCard(
            String appleAppId,
            String name,
            String developer,
            String iconUrl,
            BigDecimal rating,
            Integer ratingCount) {
    }

    public record Point(Instant t, int rank) {
    }

    /**
     * @param change       places gained since the previous reading (positive = up); null when new
     * @param status       NEW, UP, DOWN or SAME versus the previous reading
     * @param windowChange places gained over the requested window; null when not ranked back then
     * @param windowStatus NEW (not ranked at the window start), UP, DOWN, SAME, or NO_DATA (not enough history)
     * @param badges       important events of this reading: NUMBER_ONE, TOP_5, TOP_10, NEW_ENTRY, RE_ENTRY, NEW_BEST
     */
    public record RankingRow(
            int rank,
            AppCard app,
            Integer previousRank,
            Integer change,
            String status,
            Integer windowRank,
            Integer windowChange,
            String windowStatus,
            List<String> badges,
            boolean rising,
            List<Point> trend) {
    }

    /** @param currentRank rank now if still within the collected depth (e.g. 31), otherwise null */
    public record LeftRow(AppCard app, int previousRank, Integer currentRank) {
    }

    public record RankingResponse(
            Chart chart,
            Instant asOf,
            Instant previousAt,
            String window,
            Instant windowAt,
            List<RankingRow> rows,
            List<LeftRow> leftChart) {
    }

    /** @param change places gained (positive = up); null when the app entered or left */
    public record Mover(AppCard app, Integer fromRank, Integer toRank, Integer change) {
    }

    public record EventRow(
            long id,
            Instant at,
            String chart,
            AppCard app,
            String type,
            Integer tier,
            Integer previousRank,
            Integer currentRank,
            int importance,
            boolean primary,
            Integer coveredMinutes,
            boolean gap,
            String text) {
    }

    public record MoversResponse(
            Chart chart,
            Instant asOf,
            String window,
            Instant windowAt,
            List<Mover> climbers,
            List<Mover> fallers,
            List<Mover> newEntries,
            List<Mover> leftChart,
            List<Mover> rising,
            List<EventRow> tierCrossings) {
    }

    public record NumberOne(AppCard app, Instant since) {
    }

    /** @param quiet true when nothing of high importance happened in the window */
    public record HeadlinesResponse(
            Chart chart,
            Instant asOf,
            String window,
            NumberOne numberOne,
            List<EventRow> newNumberOne,
            List<EventRow> enteredTop10,
            Mover biggestClimber,
            Mover biggestDrop,
            List<EventRow> newEntries,
            boolean quiet) {
    }

    public record Series(AppCard app, List<Point> points) {
    }

    public record BumpResponse(Chart chart, String window, int stepMinutes, List<Series> series) {
    }

    public record EventsResponse(Chart chart, List<EventRow> events) {
    }

    // ------------------------------------------------------------------ apps

    public record ChartPerformance(
            String chart,
            Instant asOf,
            Integer currentRank,
            boolean inChart,
            Integer change24h,
            Integer change7d,
            Integer bestRank,
            Instant bestRankAt,
            Integer worstRank,
            Instant firstObservedAt,
            Instant inChartSince,
            boolean rising,
            Double averageRank30d,
            Map<String, Double> hoursInTier) {
    }

    public record CountryListing(
            String country,
            String name,
            String developer,
            String description,
            String iconUrl,
            String storeUrl,
            BigDecimal price,
            String currency,
            String ageRating,
            String version,
            Instant versionReleasedAt,
            String releaseNotes,
            Long sizeBytes,
            String languages,
            List<String> screenshotUrls,
            BigDecimal rating,
            Integer ratingCount,
            String detailsStatus,
            Instant detailsCheckedAt) {
    }

    public record AppResponse(
            String appleAppId,
            String bundleId,
            String developer,
            String developerAppleId,
            String releaseDate,
            Instant firstSeenAt,
            Instant lastSeenAt,
            List<CountryListing> listings,
            List<ChartPerformance> charts) {
    }

    public record HistoryResponse(String appleAppId, String chart, String range, int stepMinutes, List<Point> points) {
    }

    public record ListingVersion(String country, String name, String title, BigDecimal price, String currency,
                                 String iconUrl, Instant firstSeenAt, Instant lastSeenAt) {
    }

    public record DetailsVersion(String country, String name, String version, Instant versionReleasedAt,
                                 String releaseNotes, Long sizeBytes, Instant firstSeenAt, Instant lastSeenAt) {
    }

    public record VersionsResponse(String appleAppId, List<ListingVersion> listings, List<DetailsVersion> details) {
    }

    public record RatingPoint(String country, String day, BigDecimal rating, Integer ratingCount) {
    }

    public record SearchResult(AppCard app, List<ChartRank> charts) {
    }

    public record ChartRank(String chart, Integer rank) {
    }
}
