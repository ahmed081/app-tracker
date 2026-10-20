package com.apptracker.events;

import com.apptracker.config.AppProperties;
import com.apptracker.manage.RulesStore;
import com.apptracker.events.EngineModel.Input;
import com.apptracker.events.EngineModel.Result;
import com.apptracker.events.EventRepository.SnapshotRef;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Milestone 5: turns each new VALID snapshot into events, app states and tier
 * intervals, in slot order. Everything it writes is derived and can be rebuilt.
 */
@Service
public class EventProcessor {

    private static final Logger log = LoggerFactory.getLogger(EventProcessor.class);

    private final EventRepository repo;
    private final TransactionTemplate tx;
    private final RulesStore rules;
    private final boolean enabled;

    public EventProcessor(EventRepository repo, TransactionTemplate tx, RulesStore rules, AppProperties props) {
        this.repo = repo;
        this.tx = tx;
        this.rules = rules;
        this.enabled = props.events().enabled();
    }

    @Scheduled(initialDelayString = "10000", fixedDelayString = "${apptracker.events.run-every-ms}")
    public void scheduledRun() {
        if (!enabled) return;
        try {
            int n = processAll();
            if (n > 0) log.info("events: processed {} snapshots", n);
        } catch (RuntimeException e) {
            log.error("event processing failed", e);
        }
    }

    /** Process every pending snapshot of every chart. Returns the number processed. */
    public synchronized int processAll() {
        EventEngine engine = new EventEngine(rules.current());
        int total = 0;
        for (long chartId : repo.chartsWithPendingSnapshots()) {
            if (repo.needsRebuild(chartId)) {
                log.info("chart {}: older snapshot arrived, rebuilding its events", chartId);
                total += rebuild(chartId, engine);
            } else {
                total += processPending(chartId, engine, false);
            }
        }
        return total;
    }

    /**
     * Clear a chart's derived data and replay all its VALID snapshots. Replayed
     * events are marked as already notified, so a rebuild never sends alerts.
     */
    public synchronized int rebuild(long chartId) {
        return rebuild(chartId, new EventEngine(rules.current()));
    }

    private int rebuild(long chartId, EventEngine engine) {
        tx.executeWithoutResult(s -> repo.clearDerived(chartId));
        return processPending(chartId, engine, true);
    }

    private int processPending(long chartId, EventEngine engine, boolean replay) {
        int interval = repo.chartInterval(chartId);
        List<SnapshotRef> pending = repo.pendingSnapshots(chartId);
        for (SnapshotRef snap : pending) {
            tx.executeWithoutResult(s -> processOne(engine, chartId, interval, snap, replay));
        }
        return pending.size();
    }

    private void processOne(EventEngine engine, long chartId, int intervalMinutes, SnapshotRef snap, boolean replay) {
        Optional<SnapshotRef> prev = repo.previousProcessed(chartId, snap.slot());
        Map<Long, Integer> previousRanks = prev.map(p -> repo.ranks(p.id())).orElse(Map.of());
        Map<Long, Integer> currentRanks = repo.ranks(snap.id());
        Instant baseline = repo.baselineSlot(chartId).orElse(snap.slot());

        Set<Long> appIds = new HashSet<>(previousRanks.keySet());
        appIds.addAll(currentRanks.keySet());
        Map<Long, AppState> states = repo.states(chartId, appIds);

        Result r = engine.process(new Input(snap.id(), snap.slot(), intervalMinutes,
                prev.map(SnapshotRef::slot).orElse(null), baseline, previousRanks, currentRanks, states,
                repo.recentSlots(chartId, snap.slot(), engine.config().recentRanksKept())));

        repo.replaceEvents(chartId, snap.id(), snap.slot(), r.coveredMinutes(), r.gap(), r.events(), replay);
        repo.saveStates(chartId, snap.id(), r.states().values());
        repo.applyTierChanges(chartId, r.tierChanges(), r.tiersHeldOverGap());
        repo.markProcessed(snap.id());
    }
}
