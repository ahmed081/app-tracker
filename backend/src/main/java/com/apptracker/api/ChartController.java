package com.apptracker.api;

import com.apptracker.api.ApiModel.BumpResponse;
import com.apptracker.api.ApiModel.EventsResponse;
import com.apptracker.api.ApiModel.HeadlinesResponse;
import com.apptracker.api.ApiModel.MoversResponse;
import com.apptracker.api.ApiModel.RankingResponse;
import com.apptracker.api.QueryRepository.ChartRow;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

/**
 * Chart screens. A chart is addressed as /api/charts/{country}/{genreId}/{type},
 * e.g. /api/charts/ph/7006/top-free.
 */
@RestController
@RequestMapping("/api/charts")
public class ChartController {

    private final QueryRepository repo;
    private final QueryService service;

    public ChartController(QueryRepository repo, QueryService service) {
        this.repo = repo;
        this.service = service;
    }

    /** Every chart, with freshness (asOf, delayed). */
    @GetMapping
    public List<ApiModel.Chart> charts() {
        return repo.charts();
    }

    /** Current ranking with changes vs the previous reading and vs the window start, badges and 7-day trend. */
    @GetMapping("/{country}/{genreId}/{type}/ranking")
    public RankingResponse ranking(@PathVariable String country, @PathVariable int genreId, @PathVariable String type,
                                   @RequestParam(defaultValue = "24h") String window,
                                   @RequestParam(defaultValue = "25") int limit,
                                   @RequestParam(defaultValue = "7") int trendDays) {
        return service.ranking(chart(country, genreId, type), TimeWindow.parse(window, "24h"),
                clamp(limit, 1, 200), clamp(trendDays, 0, 30));
    }

    /** What matters right now: #1, entries into the Top 10, biggest climber and drop, new entries. */
    @GetMapping("/{country}/{genreId}/{type}/headlines")
    public HeadlinesResponse headlines(@PathVariable String country, @PathVariable int genreId, @PathVariable String type,
                                       @RequestParam(defaultValue = "24h") String window) {
        return service.headlines(chart(country, genreId, type), TimeWindow.parse(window, "24h"));
    }

    /**
     * Climbers, fallers, new entries, exits, rising apps and tier crossings over a window.
     * depth: 25 = moves in and out of the Top 25; 200 (default) = the whole chart.
     */
    @GetMapping("/{country}/{genreId}/{type}/movers")
    public MoversResponse movers(@PathVariable String country, @PathVariable int genreId, @PathVariable String type,
                                 @RequestParam(defaultValue = "24h") String window,
                                 @RequestParam(defaultValue = "3") int minPlaces,
                                 @RequestParam(defaultValue = "10") int limit,
                                 @RequestParam(defaultValue = "200") int depth) {
        return service.movers(chart(country, genreId, type), TimeWindow.parse(window, "24h"),
                clamp(minPlaces, 1, 200), clamp(limit, 1, 200), clamp(depth, 1, 200));
    }

    /**
     * Event feed. importance: 0 none, 1 low, 2 medium, 3 high. Defaults: last 7 days,
     * medium and above, one line per app per reading.
     */
    @GetMapping("/{country}/{genreId}/{type}/events")
    public EventsResponse events(@PathVariable String country, @PathVariable int genreId, @PathVariable String type,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant until,
                                 @RequestParam(defaultValue = "2") int minImportance,
                                 @RequestParam(defaultValue = "true") boolean primaryOnly,
                                 @RequestParam(required = false) List<String> types,
                                 @RequestParam(defaultValue = "50") int limit) {
        List<String> upper = types == null ? null : types.stream().map(t -> t.toUpperCase(Locale.ROOT)).toList();
        return service.events(chart(country, genreId, type), since, until, clamp(minImportance, 0, 3), primaryOnly,
                upper, clamp(limit, 1, 500));
    }

    /** Rank lines of the current top apps over a window (bump chart). */
    @GetMapping("/{country}/{genreId}/{type}/bump")
    public BumpResponse bump(@PathVariable String country, @PathVariable int genreId, @PathVariable String type,
                             @RequestParam(defaultValue = "7d") String window,
                             @RequestParam(defaultValue = "10") int top,
                             @RequestParam(required = false) Integer stepMinutes) {
        return service.bump(chart(country, genreId, type), TimeWindow.parse(window, "7d"), clamp(top, 1, 50),
                stepMinutes == null ? null : clamp(stepMinutes, 60, 7 * 24 * 60));
    }

    ChartRow chart(String country, int genreId, String type) {
        String chartType = type.toUpperCase(Locale.ROOT).replace('-', '_');
        return repo.chart(country.toLowerCase(Locale.ROOT), genreId, chartType)
                .orElseThrow(() -> new NotFoundException("No chart " + country + "/" + genreId + "/" + type));
    }

    static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
