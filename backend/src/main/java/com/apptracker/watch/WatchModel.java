package com.apptracker.watch;

import com.apptracker.api.ApiModel.AppCard;
import com.apptracker.api.ApiModel.Chart;
import com.apptracker.api.ApiModel.EventRow;
import com.apptracker.api.ApiModel.NumberOne;
import com.apptracker.api.ApiModel.Point;

import java.time.Instant;
import java.util.List;

/** JSON shapes of the watchlist API (/api/watch). Request bodies: null = leave unchanged. */
public final class WatchModel {

    private WatchModel() {
    }

    public static final String APP = "APP";
    public static final String CHART = "CHART";

    /**
     * @param kind       APP or CHART
     * @param appleAppId the followed app (APP only)
     * @param chartKey   the chart, e.g. "ph/7006/top-free"; null for an app followed in all its charts
     * @param rule       the alert rule of an app watch; null for a chart watch (fixed big moments)
     */
    public record Watch(
            long id,
            String kind,
            String appleAppId,
            String chartKey,
            boolean active,
            AlertRule rule,
            Instant createdAt,
            Instant updatedAt) {
    }

    /** Follow an app (in one chart, or in all charts when chartKey is null) or a chart. */
    public record FollowRequest(String kind, String appleAppId, String chartKey) {
    }

    public record WatchUpdate(Boolean active, AlertRule rule) {
    }

    /**
     * One line of the watchlist: a followed app in one chart. An app followed in
     * all charts has a line per chart it ranks in now (chart null when it ranks nowhere).
     *
     * @param allCharts    the watch covers every chart of the app
     * @param currentRank  null = not ranked in the latest reading
     * @param windowChange places gained over the window; null when not ranked at both ends
     * @param windowStatus NEW, UP, DOWN, SAME, NO_DATA (not enough history) or OUT (not ranked now)
     * @param trend        best rank per step over the last 7 days
     * @param lastEvent    the latest event of medium or high importance (90 days)
     */
    public record WatchedApp(
            long watchId,
            boolean allCharts,
            AlertRule rule,
            String chart,
            AppCard app,
            Integer currentRank,
            Integer windowChange,
            String windowStatus,
            List<Point> trend,
            EventRow lastEvent) {
    }

    /**
     * @param numberOne   the app at #1 now, and since when
     * @param lastKeyMove the latest big moment (30 days): a new #1, or an entry into the highest tier
     */
    public record WatchedChart(long watchId, Chart chart, NumberOne numberOne, EventRow lastKeyMove) {
    }

    public record WatchlistResponse(String window, Instant asOf, List<WatchedApp> apps, List<WatchedChart> charts) {
    }
}
