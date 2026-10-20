package com.apptracker.metadata;

import com.apptracker.config.AppProperties;
import com.apptracker.metadata.MetadataRepository.Target;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Milestone 4: looks up app details (rating, version, description, screenshots...)
 * with Apple's Lookup API, for every app that charted recently, once a day per country.
 */
@Service
public class MetadataService {

    private static final Logger log = LoggerFactory.getLogger(MetadataService.class);

    public record RunSummary(int apps, int found, int notFound, int failedCalls) {
    }

    private final MetadataRepository repo;
    private final AppleHttpClient http;
    private final TransactionTemplate tx;
    private final AppProperties.Metadata config;
    private final Clock clock;

    public MetadataService(MetadataRepository repo, AppleHttpClient http, TransactionTemplate tx,
                           AppProperties props, Clock clock) {
        this.repo = repo;
        this.http = http;
        this.tx = tx;
        this.config = props.metadata();
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "30000", fixedDelayString = "${apptracker.metadata.run-every-ms}")
    public void scheduledRun() {
        if (!config.enabled()) return;
        try {
            RunSummary s = runOnce();
            if (s.apps() > 0) log.info("metadata: {}", s);
        } catch (RuntimeException e) {
            log.error("metadata run failed", e);
        }
    }

    public RunSummary runOnce() {
        List<Target> targets = repo.findTargets(config.seenWithinDays(), config.refreshAfterHours(),
                config.retryErrorAfterMinutes(), config.maxAppsPerRun());

        // Group by country, then batches of up to batch-size IDs per call.
        Map<String, List<Target>> byCountry = new LinkedHashMap<>();
        for (Target t : targets) byCountry.computeIfAbsent(t.countryCode(), k -> new ArrayList<>()).add(t);

        int found = 0, notFound = 0, failed = 0;
        for (Map.Entry<String, List<Target>> e : byCountry.entrySet()) {
            List<Target> all = e.getValue();
            for (int i = 0; i < all.size(); i += config.batchSize()) {
                List<Target> batch = all.subList(i, Math.min(all.size(), i + config.batchSize()));
                int[] r = lookupBatch(e.getKey(), batch);
                found += r[0];
                notFound += r[1];
                failed += r[2];
            }
        }
        return new RunSummary(targets.size(), found, notFound, failed);
    }

    /** @return {found, notFound, failedCalls} */
    int[] lookupBatch(String countryCode, List<Target> batch) {
        List<String> ids = batch.stream().map(Target::appleAppId).toList();
        String url = LookupParser.lookupUrl(http.baseUrl(), countryCode, ids);
        AppleHttpClient.Response res = http.getText(url);
        Instant at = clock.instant();

        Map<String, AppDetails> details = null;
        String parseError = null;
        if (res.ok()) {
            try {
                details = LookupParser.parse(res.body());
            } catch (Exception ex) {
                parseError = "unparsable lookup body: " + ex.getMessage();
            }
        }
        final Map<String, AppDetails> parsed = details;
        final AppleHttpClient.Response stored = parseError == null ? res
                : new AppleHttpClient.Response(false, res.status(), res.contentType(), res.body(), parseError, res.attempts());

        int[] counts = new int[3];
        tx.executeWithoutResult(status -> {
            repo.insertRawLookup(countryCode, at, url, ids, stored);
            for (Target t : batch) {
                if (parsed == null) {
                    repo.recordCheck(t.appId(), countryCode, "ERROR", at);
                } else if (parsed.containsKey(t.appleAppId())) {
                    AppDetails d = parsed.get(t.appleAppId());
                    repo.saveVersion(t.appId(), countryCode, d, at);
                    repo.saveRating(t.appId(), countryCode, d, at);
                    repo.recordCheck(t.appId(), countryCode, "OK", at);
                    counts[0]++;
                } else {
                    // Not on the store in this country (removed or region-locked).
                    repo.recordCheck(t.appId(), countryCode, "NOT_FOUND", at);
                    counts[1]++;
                }
            }
        });
        if (parsed == null) {
            counts[2] = 1;
            log.warn("metadata lookup failed for {} apps in {}: {}", batch.size(), countryCode, stored.error());
        }
        return counts;
    }
}
