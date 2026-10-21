package com.apptracker.watch;

import com.apptracker.watch.WatchModel.Watch;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * SQL behind the watchlist (db/watchlist.sql). One shared list: user_id is
 * always NULL. Writes only what app_backend is granted: it adds watches and
 * switches them on and off, never deletes.
 */
@Repository
public class WatchRepository {

    /** A watch plus the internal ids the queries need. */
    public record WatchRow(Watch watch, Long appId, Long chartId) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public WatchRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String WATCH_SQL = """
            SELECT w.id, w.kind, w.app_id, w.chart_id, a.apple_app_id, vc.chart_key, w.active, w.created_at, w.updated_at,
                   r.watch_id AS rule_watch_id, r.preset, r.event_types, r.min_places, r.tiers
            FROM watch w
            LEFT JOIN app a ON a.id = w.app_id
            LEFT JOIN v_chart vc ON vc.id = w.chart_id
            LEFT JOIN alert_rule r ON r.watch_id = w.id
            WHERE w.user_id IS NULL
            """;

    private WatchRow mapWatch(ResultSet rs) throws SQLException {
        String kind = rs.getString("kind");
        AlertRule rule = null;
        if (WatchModel.APP.equals(kind)) {
            // An app watch without a rule row (should not happen) gets the default.
            rule = rs.getObject("rule_watch_id") == null ? AlertRule.important() : new AlertRule(
                    rs.getString("preset"),
                    strings(rs.getArray("event_types")),
                    (Integer) rs.getObject("min_places"),
                    integers(rs.getArray("tiers")));
        }
        return new WatchRow(new Watch(
                rs.getLong("id"),
                kind,
                rs.getString("apple_app_id"),
                rs.getString("chart_key"),
                rs.getBoolean("active"),
                rule,
                instant(rs, "created_at"),
                instant(rs, "updated_at")),
                (Long) rs.getObject("app_id"),
                (Long) rs.getObject("chart_id"));
    }

    /** @param activeOnly false = also the switched-off watches */
    public List<WatchRow> watches(boolean activeOnly) {
        return jdbc.query(WATCH_SQL + (activeOnly ? " AND w.active" : "") + " ORDER BY w.created_at, w.id",
                Map.of(), (rs, i) -> mapWatch(rs));
    }

    public Optional<WatchRow> watch(long id) {
        return jdbc.query(WATCH_SQL + " AND w.id = :id", Map.of("id", id), (rs, i) -> mapWatch(rs)).stream().findFirst();
    }

    /** Follows, or switches an existing watch of the same target back on (keeping its rule). Returns the id. */
    public long follow(String kind, Long appId, Long chartId) {
        long id = jdbc.queryForObject("""
                INSERT INTO watch (kind, app_id, chart_id) VALUES (:kind, CAST(:app AS bigint), CAST(:chart AS bigint))
                ON CONFLICT ON CONSTRAINT watch_unique DO UPDATE SET active = true, updated_at = now()
                RETURNING id
                """, new MapSqlParameterSource("kind", kind).addValue("app", appId).addValue("chart", chartId), Long.class);
        if (WatchModel.APP.equals(kind)) {
            jdbc.update("INSERT INTO alert_rule (watch_id) VALUES (:id) ON CONFLICT (watch_id) DO NOTHING", Map.of("id", id));
        }
        return id;
    }

    public void setActive(long id, boolean active) {
        jdbc.update("UPDATE watch SET active = :active, updated_at = now() WHERE id = :id",
                new MapSqlParameterSource("id", id).addValue("active", active));
    }

    public void saveRule(long watchId, AlertRule rule) {
        jdbc.update("""
                INSERT INTO alert_rule (watch_id, preset, event_types, min_places, tiers, updated_at)
                VALUES (:id, :preset, CAST(:types AS text[]), CAST(:min AS integer), CAST(:tiers AS integer[]), now())
                ON CONFLICT (watch_id) DO UPDATE
                SET preset = EXCLUDED.preset, event_types = EXCLUDED.event_types, min_places = EXCLUDED.min_places,
                    tiers = EXCLUDED.tiers, updated_at = now()
                """, new MapSqlParameterSource("id", watchId)
                .addValue("preset", rule.preset())
                .addValue("types", arrayLiteral(rule.eventTypes()))
                .addValue("min", rule.minPlaces())
                .addValue("tiers", arrayLiteral(rule.tiers())));
        jdbc.update("UPDATE watch SET updated_at = now() WHERE id = :id", Map.of("id", watchId));
    }

    // ------------------------------------------------------------- lookups

    public Optional<Long> appId(String appleAppId) {
        return jdbc.query("SELECT id FROM app WHERE apple_app_id = :id", Map.of("id", appleAppId),
                (rs, i) -> rs.getLong("id")).stream().findFirst();
    }

    /** Keys of the charts the app ranks in now, best rank first. */
    public List<String> rankedCharts(long appId) {
        return jdbc.query("""
                SELECT vc.chart_key FROM app_chart_state st JOIN v_chart vc ON vc.id = st.chart_id
                WHERE st.app_id = :app AND st.current_rank IS NOT NULL
                ORDER BY st.current_rank, vc.chart_key
                """, Map.of("app", appId), (rs, i) -> rs.getString("chart_key"));
    }

    /** Country to show an app's name in when no chart says which: its latest listing's. */
    public String homeCountry(long appId) {
        return jdbc.query("""
                SELECT country_code FROM v_app_listing_latest WHERE app_id = :app ORDER BY last_seen_at DESC LIMIT 1
                """, Map.of("app", appId), (rs, i) -> rs.getString("country_code")).stream().findFirst().orElse("us");
    }

    // ------------------------------------------------------------- helpers

    /** '{A,B}' for CAST(... AS text[]) / integer[]. Values are event type names or numbers, never free text. */
    static String arrayLiteral(List<?> values) {
        if (values == null) return null;
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.size(); i++) sb.append(i == 0 ? "" : ",").append(values.get(i));
        return sb.append('}').toString();
    }

    private static List<String> strings(Array a) throws SQLException {
        return a == null ? null : Arrays.stream((Object[]) a.getArray()).map(String::valueOf).toList();
    }

    private static List<Integer> integers(Array a) throws SQLException {
        return a == null ? null : Arrays.stream((Object[]) a.getArray()).map(o -> ((Number) o).intValue()).toList();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime t = rs.getObject(column, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }
}
