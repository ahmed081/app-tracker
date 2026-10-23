package com.apptracker.radar;

import com.apptracker.radar.RadarModel.DismissRequest;
import com.apptracker.radar.RadarModel.Dismissal;
import com.apptracker.radar.RadarModel.RadarResponse;
import com.apptracker.radar.RadarModel.Theme;
import com.apptracker.radar.RadarModel.ThemeRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The Radar: new niches spotted in the existing history. Reads are open; writes
 * (themes, dismissals) need X-Admin-Key when ADMIN_KEY is set (see WebConfig).
 * Themes are switched off, never deleted.
 */
@RestController
@RequestMapping("/api/radar")
public class RadarController {

    private final RadarService service;

    public RadarController(RadarService service) {
        this.service = service;
    }

    /**
     * Newcomers, rising from the bottom, emerging words, possible niches, and what ranks
     * abroad but not here, for one country and all its tracked categories (or one).
     * window: a number of days from 1 to 90 (4d by default, e.g. 14d, 30d).
     * minScore=0 shows every app ("Show all").
     */
    @GetMapping
    public RadarResponse radar(@RequestParam(defaultValue = "ph") String country,
                               @RequestParam(required = false) Integer genre,
                               @RequestParam(defaultValue = RadarService.DEFAULT_WINDOW) String window,
                               @RequestParam(defaultValue = "true") boolean hideKnown,
                               @RequestParam(defaultValue = "false") boolean showDismissed,
                               @RequestParam(defaultValue = "4") int minScore) {
        return service.radar(country, genre, window, hideKnown, showDismissed, minScore);
    }

    /** Every theme, switched off ones included. */
    @GetMapping("/themes")
    public List<Theme> themes() {
        return service.themes();
    }

    @PostMapping("/themes")
    public Theme createTheme(@RequestBody ThemeRequest body) {
        return service.createTheme(body);
    }

    /** {name?, keywords?, active?}; {active: false} switches the theme off. */
    @PutMapping("/themes/{id}")
    public Theme updateTheme(@PathVariable long id, @RequestBody ThemeRequest body) {
        return service.updateTheme(id, body);
    }

    /** {appleAppId, active}: true hides the app from the Radar, false shows it again. */
    @PostMapping("/dismiss")
    public Dismissal dismiss(@RequestBody DismissRequest body) {
        return service.dismiss(body);
    }
}
