package com.apptracker.manage;

import com.apptracker.events.EventProcessor;
import com.apptracker.manage.ManageModel.Country;
import com.apptracker.manage.ManageModel.CountryCreate;
import com.apptracker.manage.ManageModel.CountryUpdate;
import com.apptracker.manage.ManageModel.Genre;
import com.apptracker.manage.ManageModel.GenreUpdate;
import com.apptracker.manage.ManageModel.Rebuild;
import com.apptracker.manage.ManageModel.Rules;
import com.apptracker.manage.ManageModel.Status;
import com.apptracker.manage.ManageModel.Tracking;
import com.apptracker.manage.ManageModel.TrackingCountryUpdate;
import com.apptracker.manage.ManageModel.TrackingCreate;
import com.apptracker.manage.ManageModel.TrackingUpdate;
import com.apptracker.metadata.MetadataService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * The Settings menu's API. Open when ADMIN_KEY is empty; otherwise every
 * request needs the X-Admin-Key header (see WebConfig). Nothing is ever
 * deleted: "remove" means "switch off".
 */
@RestController
@RequestMapping("/api/manage")
public class ManageController {

    private final ManageService service;
    private final RebuildJob rebuild;
    private final EventProcessor events;
    private final MetadataService metadata;

    public ManageController(ManageService service, RebuildJob rebuild, EventProcessor events, MetadataService metadata) {
        this.service = service;
        this.rebuild = rebuild;
        this.events = events;
        this.metadata = metadata;
    }

    @GetMapping("/countries")
    public List<Country> countries() {
        return service.countries();
    }

    @PostMapping("/countries")
    @ResponseStatus(HttpStatus.CREATED)
    public Country addCountry(@RequestBody CountryCreate body) {
        return service.addCountry(body);
    }

    @PatchMapping("/countries/{code}")
    public Country updateCountry(@PathVariable String code, @RequestBody CountryUpdate body) {
        return service.updateCountry(code, body);
    }

    @GetMapping("/genres")
    public List<Genre> genres() {
        return service.genres();
    }

    @PatchMapping("/genres/{id}")
    public Genre updateGenre(@PathVariable int id, @RequestBody GenreUpdate body) {
        return service.updateGenre(id, body.enabled());
    }

    @GetMapping("/tracking")
    public List<Tracking> tracking() {
        return service.trackings();
    }

    @PostMapping("/tracking")
    @ResponseStatus(HttpStatus.CREATED)
    public Tracking addTracking(@RequestBody TrackingCreate body) {
        return service.addTracking(body);
    }

    @PatchMapping("/tracking/{id}")
    public Tracking updateTracking(@PathVariable long id, @RequestBody TrackingUpdate body) {
        return service.updateTracking(id, body);
    }

    /** Adds the country to the tracking row, or switches it on/off there. */
    @PutMapping("/tracking/{id}/countries/{code}")
    public Tracking setTrackingCountry(@PathVariable long id, @PathVariable String code,
                                       @RequestBody TrackingCountryUpdate body) {
        return service.setTrackingCountry(id, code, body.active());
    }

    @GetMapping("/rules")
    public Rules rules() {
        return service.rules();
    }

    @PutMapping("/rules")
    public Rules saveRules(@RequestBody EventRules body) {
        return service.saveRules(body);
    }

    /** Back to the application.yml defaults. */
    @DeleteMapping("/rules")
    public Rules resetRules() {
        return service.resetRules();
    }

    @GetMapping("/status")
    public Status status() {
        return service.status();
    }

    /** Process pending snapshots now instead of waiting for the next minute. */
    @PostMapping("/actions/process-events")
    public Map<String, Object> processEvents() {
        return Map.of("processedSnapshots", events.processAll());
    }

    /** Recompute every chart's events with the current rules, in the background. Progress: /status. */
    @PostMapping("/actions/rebuild-events")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Rebuild rebuildEvents() {
        return rebuild.start();
    }

    /** Look up app details now instead of waiting for the next run. */
    @PostMapping("/actions/refresh-metadata")
    public MetadataService.RunSummary refreshMetadata() {
        return metadata.runOnce();
    }
}
