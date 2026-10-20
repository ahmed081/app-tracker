package com.apptracker.api;

import com.apptracker.api.ApiModel.AppResponse;
import com.apptracker.api.ApiModel.EventRow;
import com.apptracker.api.ApiModel.HistoryResponse;
import com.apptracker.api.ApiModel.Point;
import com.apptracker.api.ApiModel.RatingPoint;
import com.apptracker.api.ApiModel.SearchResult;
import com.apptracker.api.ApiModel.VersionsResponse;
import com.apptracker.api.QueryRepository.AppRow;
import com.apptracker.api.QueryRepository.ChartRow;
import com.apptracker.api.QueryRepository.SnapRef;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** App pages. Apps are addressed by their Apple App ID, e.g. /api/apps/6738949114. */
@RestController
@RequestMapping("/api")
public class AppController {

    private final QueryRepository repo;

    public AppController(QueryRepository repo) {
        this.repo = repo;
    }

    /** Identity, store listing and details per country, and performance in every chart. */
    @GetMapping("/apps/{appleAppId}")
    public AppResponse app(@PathVariable String appleAppId) {
        AppRow a = app0(appleAppId);
        return new AppResponse(a.appleAppId(), a.bundleId(), a.developer(), a.developerAppleId(), a.releaseDate(),
                a.firstSeenAt(), a.lastSeenAt(), repo.listings(a.id()), repo.performance(a.id()));
    }

    /** Rank over time in one chart, one point per step (best rank in the step). */
    @GetMapping("/apps/{appleAppId}/history")
    public HistoryResponse history(@PathVariable String appleAppId,
                                   @RequestParam String chart,
                                   @RequestParam(defaultValue = "30d") String range,
                                   @RequestParam(required = false) Integer stepMinutes) {
        AppRow a = app0(appleAppId);
        ChartRow c = repo.chartByKey(chart)
                .orElseThrow(() -> new NotFoundException("No chart " + chart + " (use a key like ph/7006/top-free)"));
        TimeWindow w = TimeWindow.parse(range, "30d");
        int step = stepMinutes != null ? ChartController.clamp(stepMinutes, 60, 7 * 24 * 60) : w.defaultStepMinutes();
        Instant to = repo.latest(c.id()).map(SnapRef::slot).orElse(Instant.now());
        Instant from = w.minutes() >= TimeWindow.ALL_MINUTES ? Instant.EPOCH : to.minus(Duration.ofMinutes(w.minutes()));
        List<Point> points = repo.series(c.id(), List.of(a.id()), from, to, step).getOrDefault(a.id(), List.of());
        return new HistoryResponse(a.appleAppId(), c.chart().key(), w.label(), step, points);
    }

    /** The app's events in every chart, newest first. */
    @GetMapping("/apps/{appleAppId}/events")
    public List<EventRow> events(@PathVariable String appleAppId,
                                 @RequestParam(defaultValue = "90d") String range,
                                 @RequestParam(defaultValue = "1") int minImportance,
                                 @RequestParam(defaultValue = "100") int limit) {
        AppRow a = app0(appleAppId);
        TimeWindow w = TimeWindow.parse(range, "90d");
        Instant now = Instant.now();
        return repo.withNames(repo.events(null, a.id(), now.minus(Duration.ofMinutes(w.minutes())), now,
                ChartController.clamp(minImportance, 0, 3), false, null, ChartController.clamp(limit, 1, 1000)));
    }

    /** Every change to the store listing (name, icon, price) and to the details (version, release notes). */
    @GetMapping("/apps/{appleAppId}/versions")
    public VersionsResponse versions(@PathVariable String appleAppId) {
        AppRow a = app0(appleAppId);
        return new VersionsResponse(a.appleAppId(), repo.listingVersions(a.id()), repo.detailsVersions(a.id()));
    }

    /** Daily rating and rating count per country. */
    @GetMapping("/apps/{appleAppId}/ratings")
    public List<RatingPoint> ratings(@PathVariable String appleAppId,
                                     @RequestParam(defaultValue = "90d") String range) {
        AppRow a = app0(appleAppId);
        TimeWindow w = TimeWindow.parse(range, "90d");
        Instant from = w.minutes() >= TimeWindow.ALL_MINUTES ? Instant.EPOCH
                : Instant.now().minus(Duration.ofMinutes(w.minutes()));
        return repo.ratings(a.id(), from);
    }

    /** Find apps by name, developer, Apple ID or bundle ID. */
    @GetMapping("/search")
    public List<SearchResult> search(@RequestParam String q, @RequestParam(defaultValue = "20") int limit) {
        String query = q.trim();
        if (query.length() < 2) throw new IllegalArgumentException("Search needs at least 2 characters");
        return repo.search(query, ChartController.clamp(limit, 1, 50));
    }

    private AppRow app0(String appleAppId) {
        return repo.app(appleAppId).orElseThrow(() -> new NotFoundException("No app " + appleAppId));
    }
}
