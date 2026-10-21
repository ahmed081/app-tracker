package com.apptracker.watch;

import com.apptracker.api.TimeWindow;
import com.apptracker.watch.WatchModel.FollowRequest;
import com.apptracker.watch.WatchModel.Watch;
import com.apptracker.watch.WatchModel.WatchUpdate;
import com.apptracker.watch.WatchModel.WatchlistResponse;
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
 * The shared watchlist. Reads are open; writes need X-Admin-Key when ADMIN_KEY
 * is set (see WebConfig). Unfollowing switches a watch off; nothing is deleted.
 */
@RestController
@RequestMapping("/api/watch")
public class WatchController {

    private final WatchService service;

    public WatchController(WatchService service) {
        this.service = service;
    }

    /** Followed apps (a line per chart) and charts, with rank, change over the window, trend and last event. */
    @GetMapping
    public WatchlistResponse watchlist(@RequestParam(defaultValue = "24h") String window) {
        return service.watchlist(TimeWindow.parse(window, "24h"));
    }

    /**
     * Active watches, for Follow buttons. With appleAppId and/or chartKey, only the
     * watches covering them (an app followed in all charts covers every chart).
     */
    @GetMapping("/status")
    public List<Watch> status(@RequestParam(required = false) String appleAppId,
                              @RequestParam(required = false) String chartKey) {
        return service.status(appleAppId, chartKey);
    }

    /** Follow an app (in one chart, or all its charts without chartKey) or a chart. Following again reactivates. */
    @PostMapping
    public Watch follow(@RequestBody FollowRequest body) {
        return service.follow(body);
    }

    /** {active: false} unfollows; {rule: {...}} changes an app watch's alert rule. */
    @PutMapping("/{id}")
    public Watch update(@PathVariable long id, @RequestBody WatchUpdate body) {
        return service.update(id, body);
    }
}
