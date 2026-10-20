package com.apptracker.manage;

import com.apptracker.config.AppProperties;
import com.apptracker.events.EngineModel;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/**
 * The event rules in force: application.yml defaults, overridden by the
 * {@code setting.event_rules} row when the Settings menu saved one. Cached for 15 seconds.
 */
@Component
public class RulesStore {

    static final String KEY = "event_rules";
    private static final Duration CACHE_FOR = Duration.ofSeconds(15);
    private static final Logger log = LoggerFactory.getLogger(RulesStore.class);
    private static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /** Saved rules and when they were saved. */
    public record Saved(EventRules rules, Instant updatedAt) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final EngineModel.Config defaults;

    private EngineModel.Config cached;
    private Instant cachedAt = Instant.EPOCH;

    public RulesStore(NamedParameterJdbcTemplate jdbc, Clock clock, AppProperties props) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.defaults = props.events().toEngineConfig();
    }

    /** The engine configuration to use now. */
    public synchronized EngineModel.Config current() {
        Instant now = clock.instant();
        if (cached == null || now.isAfter(cachedAt.plus(CACHE_FOR))) {
            cached = saved().map(s -> s.rules().applyTo(defaults)).orElse(defaults);
            cachedAt = now;
        }
        return cached;
    }

    public EngineModel.Config defaults() {
        return defaults;
    }

    public Optional<Saved> saved() {
        try {
            return jdbc.query("SELECT value::text AS value, updated_at FROM setting WHERE key = :key",
                    Map.of("key", KEY), (rs, i) -> {
                        Timestamp t = rs.getTimestamp("updated_at");
                        return new Saved(parse(rs.getString("value")), t == null ? null : t.toInstant());
                    }).stream().findFirst();
        } catch (RuntimeException e) {
            // Unreadable row or missing table (db/management.sql not applied yet): keep the defaults.
            log.warn("event rules: using application.yml defaults ({})", e.getMessage());
            return Optional.empty();
        }
    }

    public synchronized void save(EventRules rules) {
        try {
            jdbc.update("""
                    INSERT INTO setting (key, value, updated_at) VALUES (:key, CAST(:value AS jsonb), now())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
                    """, new MapSqlParameterSource("key", KEY).addValue("value", JSON.writeValueAsString(rules)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        cached = null;
    }

    /** Back to the application.yml defaults. */
    public synchronized void reset() {
        jdbc.update("DELETE FROM setting WHERE key = :key", Map.of("key", KEY));
        cached = null;
    }

    /** Missing fields keep their default, so older saved rows stay readable. */
    EventRules parse(String json) {
        try {
            EventRules base = EventRules.of(defaults);
            Map<String, Object> merged = JSON.convertValue(base, Map.class);
            merged.putAll(JSON.readValue(json, Map.class));
            return JSON.convertValue(merged, EventRules.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Unreadable event rules: " + e.getOriginalMessage());
        }
    }
}
