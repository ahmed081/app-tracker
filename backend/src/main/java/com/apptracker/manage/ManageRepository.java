package com.apptracker.manage;

import com.apptracker.manage.ManageModel.ChartStatus;
import com.apptracker.manage.ManageModel.Collector;
import com.apptracker.manage.ManageModel.Country;
import com.apptracker.manage.ManageModel.Events;
import com.apptracker.manage.ManageModel.Genre;
import com.apptracker.manage.ManageModel.Tracking;
import com.apptracker.manage.ManageModel.TrackingCountry;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * SQL behind the Settings menu. Writes only what app_backend is granted
 * (db/management.sql): it adds rows and flips switches, never deletes.
 */
@Repository
public class ManageRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ManageRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------- countries

    public List<Country> countries() {
        return jdbc.query("""
                SELECT c.code, c.name, c.enabled,
                       (SELECT count(*) FROM chart ch WHERE ch.country_code = c.code AND ch.active) AS active_charts
                FROM country c
                ORDER BY c.name
                """, Map.of(), (rs, i) -> new Country(rs.getString("code"), rs.getString("name"),
                rs.getBoolean("enabled"), rs.getInt("active_charts")));
    }

    public Optional<Country> country(String code) {
        return countries().stream().filter(c -> c.code().equals(code)).findFirst();
    }

    /** False when the code already exists. */
    public boolean insertCountry(String code, String name, boolean enabled) {
        return jdbc.update("""
                INSERT INTO country (code, name, enabled) VALUES (:code, :name, :enabled)
                ON CONFLICT (code) DO NOTHING
                """, new MapSqlParameterSource("code", code).addValue("name", name).addValue("enabled", enabled)) == 1;
    }

    /** False when there is no such country. */
    public boolean updateCountry(String code, String name, Boolean enabled) {
        return jdbc.update("""
                UPDATE country
                SET name = COALESCE(CAST(:name AS text), name),
                    enabled = COALESCE(CAST(:enabled AS boolean), enabled),
                    updated_at = now()
                WHERE code = :code
                """, new MapSqlParameterSource("code", code).addValue("name", name).addValue("enabled", enabled)) == 1;
    }

    // ---------------------------------------------------------------- genres

    public List<Genre> genres() {
        return jdbc.query("""
                SELECT id, name, parent_id, enabled, available_on_apple FROM genre ORDER BY name
                """, Map.of(), (rs, i) -> new Genre(rs.getInt("id"), rs.getString("name"),
                (Integer) rs.getObject("parent_id"), rs.getBoolean("enabled"), rs.getBoolean("available_on_apple")));
    }

    public Optional<Genre> genre(int id) {
        return genres().stream().filter(g -> g.id() == id).findFirst();
    }

    public boolean updateGenre(int id, boolean enabled) {
        return jdbc.update("UPDATE genre SET enabled = :enabled, updated_at = now() WHERE id = :id",
                new MapSqlParameterSource("id", id).addValue("enabled", enabled)) == 1;
    }

    // -------------------------------------------------------------- tracking

    public List<Tracking> trackings() {
        Map<Long, List<TrackingCountry>> countries = new HashMap<>();
        jdbc.query("SELECT tracking_id, country_code, active FROM tracking_country ORDER BY country_code", Map.of(), rs -> {
            countries.computeIfAbsent(rs.getLong("tracking_id"), k -> new ArrayList<>())
                    .add(new TrackingCountry(rs.getString("country_code"), rs.getBoolean("active")));
        });
        return jdbc.query("""
                SELECT t.id, t.genre_id, g.name AS genre_name, t.chart_type, t.depth, t.interval_minutes,
                       t.all_countries, t.active,
                       (SELECT count(*) FROM v_tracking_target vt WHERE vt.tracking_id = t.id) AS target_charts
                FROM tracking t
                JOIN genre g ON g.id = t.genre_id
                ORDER BY g.name, t.chart_type
                """, Map.of(), (rs, i) -> new Tracking(
                rs.getLong("id"),
                rs.getInt("genre_id"),
                rs.getString("genre_name"),
                rs.getString("chart_type"),
                rs.getInt("depth"),
                rs.getInt("interval_minutes"),
                rs.getBoolean("all_countries"),
                rs.getBoolean("active"),
                countries.getOrDefault(rs.getLong("id"), List.of()),
                rs.getInt("target_charts")));
    }

    public Optional<Tracking> tracking(long id) {
        return trackings().stream().filter(t -> t.id() == id).findFirst();
    }

    /** The new id, or empty when this category + chart type is already tracked. */
    public Optional<Long> insertTracking(int genreId, String chartType, int depth, int intervalMinutes,
                                         boolean allCountries, boolean active) {
        return jdbc.query("""
                INSERT INTO tracking (genre_id, chart_type, depth, interval_minutes, all_countries, active)
                VALUES (:genre, :type, :depth, :interval, :all, :active)
                ON CONFLICT (genre_id, chart_type) DO NOTHING
                RETURNING id
                """, new MapSqlParameterSource("genre", genreId).addValue("type", chartType).addValue("depth", depth)
                .addValue("interval", intervalMinutes).addValue("all", allCountries).addValue("active", active),
                (rs, i) -> rs.getLong("id")).stream().findFirst();
    }

    public boolean updateTracking(long id, Integer depth, Integer intervalMinutes, Boolean allCountries, Boolean active) {
        return jdbc.update("""
                UPDATE tracking
                SET depth = COALESCE(CAST(:depth AS integer), depth),
                    interval_minutes = COALESCE(CAST(:interval AS integer), interval_minutes),
                    all_countries = COALESCE(CAST(:all AS boolean), all_countries),
                    active = COALESCE(CAST(:active AS boolean), active),
                    updated_at = now()
                WHERE id = :id
                """, new MapSqlParameterSource("id", id).addValue("depth", depth).addValue("interval", intervalMinutes)
                .addValue("all", allCountries).addValue("active", active)) == 1;
    }

    /** Adds the country to the tracking row, or switches it on/off. */
    public void setTrackingCountry(long trackingId, String countryCode, boolean active) {
        jdbc.update("""
                INSERT INTO tracking_country (tracking_id, country_code, active) VALUES (:tracking, :country, :active)
                ON CONFLICT (tracking_id, country_code) DO UPDATE SET active = EXCLUDED.active
                """, new MapSqlParameterSource("tracking", trackingId).addValue("country", countryCode)
                .addValue("active", active));
    }

    // ---------------------------------------------------------------- status

    public List<ChartStatus> chartStatuses() {
        return jdbc.query("""
                SELECT vc.chart_key, vc.country_code, vc.country_name, vc.genre_id, vc.genre_name, vc.chart_type,
                       vc.active, vc.interval_minutes, vc.last_attempt_at, vc.last_valid_snapshot_at,
                       ls.slot_start AS last_slot, ls.status AS last_status, ls.reasons AS last_reasons,
                       ls.entry_count AS last_entry_count,
                       (vc.active AND (vc.last_valid_snapshot_at IS NULL
                        OR vc.last_valid_snapshot_at < now() - make_interval(mins => 2 * vc.interval_minutes))) AS delayed,
                       (SELECT count(*) FROM snapshot s
                         WHERE s.chart_id = vc.id AND s.status = 'VALID' AND s.processed_at IS NULL) AS pending
                FROM v_chart vc
                LEFT JOIN LATERAL (
                    SELECT slot_start, status, reasons, entry_count FROM snapshot s
                    WHERE s.chart_id = vc.id ORDER BY slot_start DESC LIMIT 1
                ) ls ON true
                ORDER BY vc.active DESC, vc.country_name, vc.genre_name, vc.chart_type
                """, Map.of(), (rs, i) -> new ChartStatus(
                rs.getString("chart_key"),
                rs.getString("country_code"),
                rs.getString("country_name"),
                rs.getInt("genre_id"),
                rs.getString("genre_name"),
                rs.getString("chart_type"),
                rs.getBoolean("active"),
                rs.getInt("interval_minutes"),
                instant(rs, "last_attempt_at"),
                instant(rs, "last_valid_snapshot_at"),
                instant(rs, "last_slot"),
                rs.getString("last_status"),
                rs.getString("last_reasons"),
                (Integer) rs.getObject("last_entry_count"),
                rs.getBoolean("delayed"),
                rs.getInt("pending")));
    }

    public Collector collector() {
        return jdbc.queryForObject("""
                SELECT (SELECT count(*) FROM v_tracking_target) AS target_charts,
                       (SELECT max(last_attempt_at) FROM chart) AS last_attempt_at,
                       (SELECT max(last_valid_snapshot_at) FROM chart) AS last_valid
                """, Map.of(), (rs, i) -> new Collector(rs.getInt("target_charts"),
                instant(rs, "last_attempt_at"), instant(rs, "last_valid")));
    }

    public Events events() {
        return jdbc.queryForObject("""
                SELECT (SELECT count(*) FROM snapshot WHERE status = 'VALID' AND processed_at IS NULL) AS pending,
                       (SELECT max(processed_at) FROM snapshot) AS last_processed
                """, Map.of(), (rs, i) -> new Events(rs.getInt("pending"), instant(rs, "last_processed")));
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}
