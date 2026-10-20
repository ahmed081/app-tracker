package com.apptracker.config;

import com.apptracker.events.EngineModel;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/** Everything under {@code apptracker:} in application.yml. */
@ConfigurationProperties(prefix = "apptracker")
public record AppProperties(
        String adminKey,
        List<String> corsOrigins,
        Apple apple,
        Metadata metadata,
        Events events) {

    public record Apple(
            String baseUrl,
            String userAgent,
            int timeoutSeconds,
            long minIntervalMs,
            List<Integer> retryDelaysSeconds) {
    }

    public record Metadata(
            boolean enabled,
            long runEveryMs,
            int batchSize,
            int refreshAfterHours,
            int retryErrorAfterMinutes,
            int seenWithinDays,
            int maxAppsPerRun) {
    }

    public record Events(
            boolean enabled,
            long runEveryMs,
            int displayDepth,
            List<Integer> tiers,
            int bigMovePlaces,
            int risingHours,
            int risingGainPercent,
            int risingMinNetPlaces,
            int newBestAfterDays,
            int gapFactor,
            int recentRanksKept) {

        public EngineModel.Config toEngineConfig() {
            return new EngineModel.Config(displayDepth, List.copyOf(tiers), bigMovePlaces, risingHours,
                    risingGainPercent, risingMinNetPlaces, newBestAfterDays, gapFactor, recentRanksKept);
        }
    }
}
