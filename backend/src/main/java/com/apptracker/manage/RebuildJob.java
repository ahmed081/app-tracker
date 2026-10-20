package com.apptracker.manage;

import com.apptracker.events.EventProcessor;
import com.apptracker.events.EventRepository;
import com.apptracker.manage.ManageModel.Rebuild;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Recomputes the events of every chart, on a background thread (it can take
 * minutes). Its progress is part of /api/manage/status. One run at a time.
 */
@Component
public class RebuildJob {

    private static final Logger log = LoggerFactory.getLogger(RebuildJob.class);

    private final EventProcessor processor;
    private final EventRepository events;
    private final Clock clock;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "rebuild-all-events");
        t.setDaemon(true);
        return t;
    });

    private volatile Rebuild state = Rebuild.idle();

    public RebuildJob(EventProcessor processor, EventRepository events, Clock clock) {
        this.processor = processor;
        this.events = events;
        this.clock = clock;
    }

    public Rebuild state() {
        return state;
    }

    /** Starts the job; throws {@link ConflictException} when it is already running. */
    public synchronized Rebuild start() {
        if (state.running()) throw new ConflictException("Events are already being recomputed");
        List<Long> charts = events.chartsWithValidSnapshots();
        state = new Rebuild(true, clock.instant(), null, 0, charts.size(), 0, null);
        executor.submit(() -> run(charts));
        return state;
    }

    private void run(List<Long> charts) {
        Instant started = state.startedAt();
        int done = 0;
        int snapshots = 0;
        try {
            for (long chartId : charts) {
                snapshots += processor.rebuild(chartId);
                done++;
                state = new Rebuild(true, started, null, done, charts.size(), snapshots, null);
            }
            log.info("rebuild: recomputed {} charts, {} snapshots", done, snapshots);
            state = new Rebuild(false, started, clock.instant(), done, charts.size(), snapshots, null);
        } catch (RuntimeException e) {
            log.error("rebuild of all events failed", e);
            state = new Rebuild(false, started, clock.instant(), done, charts.size(), snapshots, e.getMessage());
        }
    }

    @PreDestroy
    void stop() {
        executor.shutdownNow();
    }
}
