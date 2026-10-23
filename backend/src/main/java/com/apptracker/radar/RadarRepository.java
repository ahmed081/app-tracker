package com.apptracker.radar;

import com.apptracker.radar.AbroadNotHere.ChartRank;
import com.apptracker.radar.RadarModel.Theme;
import com.apptracker.radar.RadarScorer.Reading;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * SQL behind the Radar: a few set-based reads of the existing history (VALID
 * snapshots only), plus the themes and dismissals of db/radar.sql. Writes only
 * what app_backend is granted: it adds and switches, never deletes.
 */
@Repository
public class RadarRepository {

    /**
     * A chart of the scope.
     *
     * @param firstValid    its first VALID reading ever
     * @param periodFirst   its first VALID reading in the period
     * @param latest        its latest VALID reading
     * @param depth         entries it really has: the latest reading's count, at most the configured depth
     */
    public record ScopeChart(long id, String key, int genreId, String genreName, int intervalMinutes, int depth,
                             Instant firstValid, Instant periodFirst, Instant latest) {
    }

    /** First appearance of an app in one chart. */
    public record FirstSeen(long appId, long chartId, Instant at) {
    }

    /** What the Radar needs to know about an app; name and summary in the requested country if possible. */
    public record AppInfo(long appId, String appleAppId, Long developerId, Instant developerFirstSeen,
                          LocalDate releaseDate, String name, String summary) {
    }

    /** Rating count on the first and last day with data; days = number of daily rows. */
    public record Ratings(Integer first, Integer last, int days) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public RadarRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ scope

    /** Active charts of the country (one category, or all with genre null) with their reading times. */
    public List<ScopeChart> scopeCharts(String country, Integer genreId, Instant periodStart) {
        return jdbc.query("""
                SELECT vc.id, vc.chart_key, vc.genre_id, vc.genre_name, vc.interval_minutes, vc.depth,
                       (SELECT min(slot_start) FROM snapshot s WHERE s.chart_id = vc.id AND s.status = 'VALID') AS first_valid,
                       (SELECT min(slot_start) FROM snapshot s
                         WHERE s.chart_id = vc.id AND s.status = 'VALID' AND s.slot_start >= :from) AS period_first,
                       l.slot_start AS latest, l.entry_count
                FROM v_chart vc
                JOIN country co ON co.code = vc.country_code AND co.enabled
                LEFT JOIN LATERAL (
                    SELECT slot_start, entry_count FROM snapshot s
                    WHERE s.chart_id = vc.id AND s.status = 'VALID' ORDER BY slot_start DESC LIMIT 1) l ON true
                WHERE vc.active AND vc.country_code = :country
                  AND (CAST(:genre AS integer) IS NULL OR vc.genre_id = CAST(:genre AS integer))
                ORDER BY vc.genre_id, vc.chart_type
                """, new MapSqlParameterSource("country", country).addValue("genre", genreId)
                .addValue("from", odt(periodStart)), (rs, i) -> new ScopeChart(
                rs.getLong("id"),
                rs.getString("chart_key"),
                rs.getInt("genre_id"),
                rs.getString("genre_name"),
                rs.getInt("interval_minutes"),
                Math.min(rs.getInt("depth"), rs.getObject("entry_count") == null ? rs.getInt("depth") : rs.getInt("entry_count")),
                instant(rs, "first_valid"),
                instant(rs, "period_first"),
                instant(rs, "latest")));
    }

    /** First VALID reading of the whole tracker. */
    public Optional<Instant> trackerStart() {
        return Optional.ofNullable(jdbc.query("SELECT min(slot_start) AS t FROM snapshot WHERE status = 'VALID'",
                Map.of(), rs -> rs.next() ? instant(rs, "t") : null));
    }

    public List<String> enabledCountries() {
        return jdbc.queryForList("SELECT code FROM country WHERE enabled ORDER BY code", Map.of(), String.class);
    }

    // ---------------------------------------------------------------- rankings

    /** Each app's first appearance in each of these charts (VALID readings, all history). */
    public List<FirstSeen> firstSeen(Collection<Long> chartIds) {
        if (chartIds.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT r.app_id, r.chart_id, min(r.slot_start) AS first_at
                FROM ranking r JOIN snapshot s ON s.id = r.snapshot_id AND s.status = 'VALID'
                WHERE r.chart_id IN (:charts)
                GROUP BY r.app_id, r.chart_id
                """, Map.of("charts", chartIds),
                (rs, i) -> new FirstSeen(rs.getLong("app_id"), rs.getLong("chart_id"), instant(rs, "first_at")));
    }

    /** app → chart → readings since the period start, oldest first (VALID readings only). */
    public Map<Long, Map<Long, List<Reading>>> periodReadings(Collection<Long> chartIds, Instant periodStart) {
        Map<Long, Map<Long, List<Reading>>> out = new HashMap<>();
        if (chartIds.isEmpty()) return out;
        jdbc.query("""
                SELECT r.app_id, r.chart_id, r.slot_start, r.rank
                FROM ranking r JOIN snapshot s ON s.id = r.snapshot_id AND s.status = 'VALID'
                WHERE r.chart_id IN (:charts) AND r.slot_start >= :from
                ORDER BY r.app_id, r.chart_id, r.slot_start
                """, new MapSqlParameterSource("charts", chartIds).addValue("from", odt(periodStart)), rs -> {
            out.computeIfAbsent(rs.getLong("app_id"), k -> new HashMap<>())
                    .computeIfAbsent(rs.getLong("chart_id"), k -> new ArrayList<>())
                    .add(new Reading(instant(rs, "slot_start"), rs.getInt("rank")));
        });
        return out;
    }

    /**
     * Ranks in the latest VALID reading of every active chart of every enabled country.
     * "since" is null when it falls within the warm-up after the chart's first reading:
     * it would only say when tracking started.
     */
    public List<ChartRank> latestRanks(Duration warmUp) {
        return jdbc.query("""
                WITH latest AS (
                    SELECT DISTINCT ON (s.chart_id) s.id, s.chart_id
                    FROM snapshot s
                    JOIN chart c ON c.id = s.chart_id AND c.active
                    JOIN country co ON co.code = c.country_code AND co.enabled
                    WHERE s.status = 'VALID'
                    ORDER BY s.chart_id, s.slot_start DESC),
                started AS (
                    SELECT chart_id, min(slot_start) AS first_valid FROM snapshot
                    WHERE status = 'VALID' AND chart_id IN (SELECT chart_id FROM latest)
                    GROUP BY chart_id)
                SELECT r.app_id, vc.country_code, vc.chart_key, vc.genre_id, r.rank,
                       CASE WHEN COALESCE(st.in_chart_since, st.first_observed_at) > sd.first_valid + make_interval(mins => :warmUp)
                            THEN COALESCE(st.in_chart_since, st.first_observed_at) END AS since
                FROM latest l
                JOIN started sd ON sd.chart_id = l.chart_id
                JOIN ranking r ON r.snapshot_id = l.id
                JOIN v_chart vc ON vc.id = l.chart_id
                LEFT JOIN app_chart_state st ON st.chart_id = l.chart_id AND st.app_id = r.app_id
                """, Map.of("warmUp", (int) warmUp.toMinutes()), (rs, i) -> new ChartRank(rs.getLong("app_id"), rs.getString("country_code"),
                rs.getString("chart_key"), rs.getInt("genre_id"), rs.getInt("rank"), instant(rs, "since")));
    }

    /** Of these apps, the ones that ever ranked in a chart of the country. */
    public Set<Long> everRanked(String country, Collection<Long> appIds) {
        if (appIds.isEmpty()) return Set.of();
        return new HashSet<>(jdbc.queryForList("""
                SELECT DISTINCT r.app_id FROM ranking r JOIN chart c ON c.id = r.chart_id
                WHERE c.country_code = :country AND r.app_id IN (:apps)
                """, new MapSqlParameterSource("country", country).addValue("apps", appIds), Long.class));
    }

    // -------------------------------------------------------------------- apps

    /** Developer, release date, and the latest name and summary (in the country, else anywhere). */
    public Map<Long, AppInfo> apps(String country, Collection<Long> appIds) {
        Map<Long, AppInfo> out = new HashMap<>();
        if (appIds.isEmpty()) return out;
        jdbc.query("""
                SELECT a.id, a.apple_app_id, a.developer_id, d.first_seen_at AS developer_first_seen,
                       COALESCE(a.release_date, CAST(m.released_at AS date)) AS release_date,
                       COALESCE(l.name, m.name, a.apple_app_id) AS name, l.summary
                FROM app a
                LEFT JOIN developer d ON d.id = a.developer_id
                LEFT JOIN LATERAL (
                    SELECT name, summary FROM app_listing_version lv
                    WHERE lv.app_id = a.id ORDER BY (lv.country_code = :country) DESC, lv.first_seen_at DESC, lv.id DESC
                    LIMIT 1) l ON true
                LEFT JOIN LATERAL (
                    SELECT name, released_at FROM app_metadata_version mv
                    WHERE mv.app_id = a.id ORDER BY (mv.country_code = :country) DESC, mv.first_seen_at DESC, mv.id DESC
                    LIMIT 1) m ON true
                WHERE a.id IN (:apps)
                """, new MapSqlParameterSource("country", country).addValue("apps", appIds), rs -> {
            out.put(rs.getLong("id"), new AppInfo(
                    rs.getLong("id"),
                    rs.getString("apple_app_id"),
                    (Long) rs.getObject("developer_id"),
                    instant(rs, "developer_first_seen"),
                    rs.getObject("release_date", LocalDate.class),
                    rs.getString("name"),
                    rs.getString("summary")));
        });
        return out;
    }

    /** Rating counts in the country since the day: first and last daily row per app. */
    public Map<Long, Ratings> ratings(String country, Collection<Long> appIds, LocalDate since) {
        Map<Long, Ratings> out = new HashMap<>();
        if (appIds.isEmpty()) return out;
        jdbc.query("""
                SELECT app_id,
                       (array_agg(rating_count ORDER BY day))[1] AS first_count,
                       (array_agg(rating_count ORDER BY day DESC))[1] AS last_count,
                       count(*) AS days
                FROM app_rating_daily
                WHERE country_code = :country AND day >= :since AND app_id IN (:apps) AND rating_count IS NOT NULL
                GROUP BY app_id
                """, new MapSqlParameterSource("country", country).addValue("since", since).addValue("apps", appIds), rs -> {
            out.put(rs.getLong("app_id"), new Ratings((Integer) rs.getObject("first_count"),
                    (Integer) rs.getObject("last_count"), rs.getInt("days")));
        });
        return out;
    }

    public Optional<Long> appId(String appleAppId) {
        return jdbc.query("SELECT id FROM app WHERE apple_app_id = :id", Map.of("id", appleAppId),
                (rs, i) -> rs.getLong("id")).stream().findFirst();
    }

    // ------------------------------------------------------- themes, dismissals

    private static final String THEME_SQL = "SELECT id, name, keywords, active, created_at, updated_at FROM radar_theme ";

    private static Theme mapTheme(ResultSet rs) throws SQLException {
        return new Theme(rs.getLong("id"), rs.getString("name"), strings(rs.getArray("keywords")),
                rs.getBoolean("active"), instant(rs, "created_at"), instant(rs, "updated_at"));
    }

    public List<Theme> themes() {
        return jdbc.query(THEME_SQL + "ORDER BY lower(name)", Map.of(), (rs, i) -> mapTheme(rs));
    }

    public Optional<Theme> theme(long id) {
        return jdbc.query(THEME_SQL + "WHERE id = :id", Map.of("id", id), (rs, i) -> mapTheme(rs)).stream().findFirst();
    }

    public long createTheme(String name, List<String> keywords) {
        return jdbc.queryForObject("""
                INSERT INTO radar_theme (name, keywords) VALUES (:name, CAST(:keywords AS text[])) RETURNING id
                """, new MapSqlParameterSource("name", name).addValue("keywords", textArray(keywords)), Long.class);
    }

    public void updateTheme(long id, String name, List<String> keywords, Boolean active) {
        jdbc.update("""
                UPDATE radar_theme
                SET name = COALESCE(CAST(:name AS text), name),
                    keywords = COALESCE(CAST(:keywords AS text[]), keywords),
                    active = COALESCE(CAST(:active AS boolean), active),
                    updated_at = now()
                WHERE id = :id
                """, new MapSqlParameterSource("id", id).addValue("name", name)
                .addValue("keywords", keywords == null ? null : textArray(keywords)).addValue("active", active));
    }

    /** Apps hidden from the Radar now. */
    public Set<Long> dismissed() {
        return new HashSet<>(jdbc.queryForList("SELECT app_id FROM radar_dismissal WHERE active", Map.of(), Long.class));
    }

    public void setDismissed(long appId, boolean active) {
        jdbc.update("""
                INSERT INTO radar_dismissal (app_id, active) VALUES (:app, :active)
                ON CONFLICT (app_id) DO UPDATE SET active = EXCLUDED.active, updated_at = now()
                """, new MapSqlParameterSource("app", appId).addValue("active", active));
    }

    // ----------------------------------------------------------------- helpers

    /** '{"a","b c"}' for CAST(... AS text[]): every element quoted, quotes and backslashes escaped. */
    static String textArray(List<String> values) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.size(); i++) {
            String v = values.get(i).replace("\\", "\\\\").replace("\"", "\\\"");
            sb.append(i == 0 ? "" : ",").append('"').append(v).append('"');
        }
        return sb.append('}').toString();
    }

    private static List<String> strings(Array a) throws SQLException {
        return a == null ? List.of() : Arrays.stream((Object[]) a.getArray()).map(String::valueOf).toList();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime t = rs.getObject(column, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    private static OffsetDateTime odt(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
