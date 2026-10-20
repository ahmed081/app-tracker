package com.apptracker.api;

import com.apptracker.events.EventProcessor;
import com.apptracker.metadata.MetadataService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Maintenance actions. Every request needs the X-Admin-Key header (see WebConfig). */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final EventProcessor events;
    private final MetadataService metadata;
    private final ChartController charts;

    public AdminController(EventProcessor events, MetadataService metadata, ChartController charts) {
        this.events = events;
        this.metadata = metadata;
        this.charts = charts;
    }

    /** Process pending snapshots now instead of waiting for the next minute. */
    @PostMapping("/events/run")
    public Map<String, Object> runEvents() {
        return Map.of("processedSnapshots", events.processAll());
    }

    /** Recompute all events, states and tier intervals of a chart from its snapshots (e.g. after changing a rule). */
    @PostMapping("/charts/{country}/{genreId}/{type}/rebuild")
    public Map<String, Object> rebuild(@PathVariable String country, @PathVariable int genreId, @PathVariable String type) {
        long chartId = charts.chart(country, genreId, type).id();
        return Map.of("chart", country + "/" + genreId + "/" + type, "processedSnapshots", events.rebuild(chartId));
    }

    /** Look up app details now instead of waiting for the next run. */
    @PostMapping("/metadata/run")
    public MetadataService.RunSummary runMetadata() {
        return metadata.runOnce();
    }
}
