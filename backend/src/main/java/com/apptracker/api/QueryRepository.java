package com.apptracker.api;

import com.apptracker.api.ApiModel.AppCard;
import com.apptracker.api.ApiModel.ChartPerformance;
import com.apptracker.api.ApiModel.ChartRank;
import com.apptracker.api.ApiModel.CountryListing;
import com.apptracker.api.ApiModel.DetailsVersion;
import com.apptracker.api.ApiModel.EventRow;
import com.apptracker.api.ApiModel.ListingVersion;
import com.apptracker.api.ApiModel.Point;
import com.apptracker.api.ApiModel.RatingPoint;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Read-only SQL behind the API. Only VALID, processed snapshots are shown. */
@Repository
public class QueryRepository {

    /** A chart plus its internal id. */
    public record ChartRow(long id, ApiModel.Chart chart) {
    }

    public record SnapRef(long id, Instant slot) {
    }

    public record AppRow(long id, String appleAppId, String bundleId, String developer, String developerAppleId,
                         String releaseDate, Instant firstSeenAt, Instant lastSeenAt) {
    }

    private static final ObjectMapper JSON = new ObjectMapper();
    private final NamedParameterJdbcTemplate jdbc;

    public QueryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------- charts

    private static final String CHART_SQL = """
            SELECT vc.id, vc.chart_key, vc.country_code, vc.country_name, vc.genre_id, vc.genre_name, vc.chart_type,
                   vc.active, vc.interval_minutes, vc.last_valid_snapshot_at, vc.last_attempt_at,
                   (SELECT max(slot_start) FROM snapshot s
                     WHERE s.chart_id = vc.id AND s.status = 'VALID' AND s.processed_at IS NOT NULL) AS as_of,
                   (vc.last_valid_snapshot_at IS NULL
                    OR vc.last_valid_snapshot_at < now() - make_interval(mins => 2 * vc.interval_minutes)) AS delayed
            FROM v_chart vc
            """;

    private ChartRow mapChart(ResultSet rs) throws SQLException {
        return new ChartRow(rs.getLong("id"), new ApiModel.Chart(
                rs.getString("chart_key"),
                rs.getString("country_code"),
                rs.getString("country_name"),
                rs.getInt("genre_id"),
                rs.getString("genre_name"),
                rs.getString("chart_type"),
                rs.getBoolean("active"),
                rs.getInt("interval_minutes"),
                instant(rs, "as_of"),
                instant(rs, "last_valid_snapshot_at"),
                instant(rs, "last_attempt_at"),
                rs.getBoolean("active") && rs.getBoolean("delayed")));
    }

    public List<ApiModel.Chart> charts() {
        return jdbc.query(CHART_SQL + " ORDER BY vc.country_code, vc.genre_name, vc.chart_type", Map.of(),
                (rs, i) -> mapChart(rs).chart());
    }

    public Optional<ChartRow> chart(String country, int genreId, String chartType) {
        return jdbc.query(CHART_SQL + " WHERE vc.country_code = :country AND vc.genre_id = :genre AND vc.chart_type = :type",
                new MapSqlParameterSource("country", country).addValue("genre", genreId).addValue("type", chartType),
                (rs, i) -> mapChart(rs)).stream().findFirst();
    }

    public Optional<ChartRow> chartByKey(String key) {
        return jdbc.query(CHART_SQL + " WHERE vc.chart_key = :key", Map.of("key", key),
                (rs, i) -> mapChart(rs)).stream().findFirst();
    }

    // ------------------------------------------------------------- snapshots

    public Optional<SnapRef> latest(long chartId) {
        return snap("""
                SELECT id, slot_start FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NOT NULL
                ORDER BY slot_start DESC LIMIT 1
                """, new MapSqlParameterSource("chart", chartId));
    }

    public Optional<SnapRef> before(long chartId, Instant slot) {
        return snap("""
                SELECT id, slot_start FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NOT NULL AND slot_start < :slot
                ORDER BY slot_start DESC LIMIT 1
                """, new MapSqlParameterSource("chart", chartId).addValue("slot", odt(slot)));
    }

    public Optional<SnapRef> atOrBefore(long chartId, Instant t) {
        return snap("""
                SELECT id, slot_start FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NOT NULL AND slot_start <= :t
                ORDER BY slot_start DESC LIMIT 1
                """, new MapSqlParameterSource("chart", chartId).addValue("t", odt(t)));
    }

    private Optional<SnapRef> snap(String sql, MapSqlParameterSource p) {
        return jdbc.query(sql, p, (rs, i) -> new SnapRef(rs.getLong("id"), instant(rs, "slot_start"))).stream().findFirst();
    }

    /** appId → rank, in rank order. */
    public Map<Long, Integer> ranks(long snapshotId) {
        Map<Long, Integer> out = new LinkedHashMap<>();
        jdbc.query("SELECT app_id, rank FROM ranking WHERE snapshot_id = :s ORDER BY rank",
                Map.of("s", snapshotId), rs -> {
                    out.put(rs.getLong("app_id"), rs.getInt("rank"));
                });
        return out;
    }

    // ------------------------------------------------------------- app cards

    /** Display fields for apps, from their latest listing, details and rating in the chart's country. */
    public Map<Long, AppCard> cards(String country, Collection<Long> appIds) {
        Map<Long, AppCard> out = new HashMap<>();
        if (appIds.isEmpty()) return out;
        jdbc.query("""
                SELECT a.id, a.apple_app_id,
                       COALESCE(l.name, m.name, a.apple_app_id) AS name,
                       COALESCE(m.developer_name, d.name) AS developer,
                       COALESCE(m.icon_url, l.icon_url) AS icon_url,
                       rt.rating, rt.rating_count
                FROM app a
                LEFT JOIN v_app_listing_latest  l  ON l.app_id = a.id  AND l.country_code = :country
                LEFT JOIN v_app_metadata_latest m  ON m.app_id = a.id  AND m.country_code = :country
                LEFT JOIN v_app_rating_latest   rt ON rt.app_id = a.id AND rt.country_code = :country
                LEFT JOIN developer d ON d.id = a.developer_id
                WHERE a.id IN (:apps)
                """, new MapSqlParameterSource("country", country).addValue("apps", appIds), rs -> {
            out.put(rs.getLong("id"), new AppCard(
                    rs.getString("apple_app_id"),
                    rs.getString("name"),
                    rs.getString("developer"),
                    rs.getString("icon_url"),
                    rs.getBigDecimal("rating"),
                    (Integer) rs.getObject("rating_count")));
        });
        return out;
    }

    // ---------------------------------------------------------------- events

    /** Badge-worthy events of one snapshot, per app. */
    public Map<Long, List<String>> badges(long snapshotId) {
        Map<Long, List<String>> out = new HashMap<>();
        jdbc.query("""
                SELECT app_id, event_type, tier FROM chart_event
                WHERE snapshot_id = :s
                  AND event_type IN ('REACHED_NUMBER_ONE', 'ENTERED_TOP_N', 'NEW_ENTRY', 'RE_ENTRY', 'NEW_BEST')
                ORDER BY importance DESC, id
                """, Map.of("s", snapshotId), rs -> {
            String type = rs.getString("event_type");
            String badge = switch (type) {
                case "REACHED_NUMBER_ONE" -> "NUMBER_ONE";
                case "ENTERED_TOP_N" -> "TOP_" + rs.getInt("tier");
                default -> type;
            };
            out.computeIfAbsent(rs.getLong("app_id"), k -> new ArrayList<>()).add(badge);
        });
        return out;
    }

    /** Raw event rows; names are filled in by the caller. */
    public record RawEvent(long id, Instant at, String chartKey, String country, long appId, String type, Integer tier,
                           Integer previousRank, Integer currentRank, int importance, boolean primary,
                           Integer coveredMinutes, boolean gap) {
    }

    /**
     * @param chartId   null = every chart (used for app pages, with appId)
     * @param appId     null = every app
     * @param types     null = every type
     */
    public List<RawEvent> events(Long chartId, Long appId, Instant since, Instant until, int minImportance,
                                 boolean primaryOnly, List<String> types, int limit) {
        StringBuilder sql = new StringBuilder("""
                SELECT e.id, e.occurred_at, vc.chart_key, vc.country_code, e.app_id, e.event_type, e.tier,
                       e.previous_rank, e.current_rank, e.importance, e.is_primary, e.covered_minutes, e.gap
                FROM chart_event e
                JOIN v_chart vc ON vc.id = e.chart_id
                WHERE e.importance >= :minImportance
                  AND e.occurred_at > :since AND e.occurred_at <= :until
                """);
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("minImportance", minImportance)
                .addValue("since", odt(since))
                .addValue("until", odt(until))
                .addValue("limit", limit);
        if (chartId != null) {
            sql.append(" AND e.chart_id = :chart");
            p.addValue("chart", chartId);
        }
        if (appId != null) {
            sql.append(" AND e.app_id = :app");
            p.addValue("app", appId);
        }
        if (primaryOnly) sql.append(" AND e.is_primary");
        if (types != null && !types.isEmpty()) {
            sql.append(" AND e.event_type IN (:types)");
            p.addValue("types", types);
        }
        sql.append(" ORDER BY e.occurred_at DESC, e.importance DESC, e.id LIMIT :limit");
        return jdbc.query(sql.toString(), p, (rs, i) -> new RawEvent(
                rs.getLong("id"),
                instant(rs, "occurred_at"),
                rs.getString("chart_key"),
                rs.getString("country_code"),
                rs.getLong("app_id"),
                rs.getString("event_type"),
                (Integer) rs.getObject("tier"),
                (Integer) rs.getObject("previous_rank"),
                (Integer) rs.getObject("current_rank"),
                rs.getInt("importance"),
                rs.getBoolean("is_primary"),
                (Integer) rs.getObject("covered_minutes"),
                rs.getBoolean("gap")));
    }

    /** Turn raw events into API rows with app names (looked up per chart country). */
    public List<EventRow> withNames(List<RawEvent> raw) {
        Map<String, List<Long>> byCountry = new HashMap<>();
        for (RawEvent e : raw) byCountry.computeIfAbsent(e.country(), k -> new ArrayList<>()).add(e.appId());
        Map<String, Map<Long, AppCard>> cards = new HashMap<>();
        byCountry.forEach((country, ids) -> cards.put(country, cards(country, ids)));
        List<EventRow> out = new ArrayList<>(raw.size());
        for (RawEvent e : raw) {
            AppCard card = cards.get(e.country()).get(e.appId());
            out.add(new EventRow(e.id(), e.at(), e.chartKey(), card, e.type(), e.tier(), e.previousRank(),
                    e.currentRank(), e.importance(), e.primary(), e.coveredMinutes(), e.gap(),
                    EventText.describe(e.type(), e.tier(), e.previousRank(), e.currentRank(),
                            card == null ? null : card.name())));
        }
        return out;
    }

    // ------------------------------------------------------- state and series

    public Map<Long, Boolean> rising(long chartId, Collection<Long> appIds) {
        Map<Long, Boolean> out = new HashMap<>();
        if (appIds.isEmpty()) return out;
        jdbc.query("SELECT app_id, rising FROM app_chart_state WHERE chart_id = :chart AND app_id IN (:apps)",
                new MapSqlParameterSource("chart", chartId).addValue("apps", appIds),
                rs -> {
                    out.put(rs.getLong("app_id"), rs.getBoolean("rising"));
                });
        return out;
    }

    /** Apps currently flagged as rising, best rank first: appId → current rank. */
    public Map<Long, Integer> risingApps(long chartId, int limit) {
        Map<Long, Integer> out = new LinkedHashMap<>();
        jdbc.query("""
                SELECT app_id, current_rank FROM app_chart_state
                WHERE chart_id = :chart AND rising AND current_rank IS NOT NULL
                ORDER BY current_rank LIMIT :limit
                """, new MapSqlParameterSource("chart", chartId).addValue("limit", limit), rs -> {
            out.put(rs.getLong("app_id"), rs.getInt("current_rank"));
        });
        return out;
    }

    /** Start of the app's current stay in a tier, if it is in it. */
    public Optional<Instant> inTierSince(long chartId, long appId, int tier) {
        return jdbc.query("""
                SELECT started_at FROM tier_interval
                WHERE chart_id = :chart AND app_id = :app AND tier = :tier AND ended_at IS NULL
                """, new MapSqlParameterSource("chart", chartId).addValue("app", appId).addValue("tier", tier),
                (rs, i) -> instant(rs, "started_at")).stream().findFirst();
    }

    /** Best rank per time bucket, per app, from VALID snapshots only. */
    public Map<Long, List<Point>> series(long chartId, Collection<Long> appIds, Instant from, Instant to, int stepMinutes) {
        Map<Long, List<Point>> out = new LinkedHashMap<>();
        if (appIds.isEmpty()) return out;
        jdbc.query("""
                SELECT r.app_id,
                       date_bin(make_interval(mins => :step), r.slot_start, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
                       min(r.rank) AS rank
                FROM ranking r
                JOIN snapshot s ON s.id = r.snapshot_id AND s.status = 'VALID'
                WHERE r.chart_id = :chart AND r.app_id IN (:apps) AND r.slot_start > :from AND r.slot_start <= :to
                GROUP BY 1, 2
                ORDER BY 1, 2
                """, new MapSqlParameterSource("chart", chartId).addValue("apps", appIds)
                .addValue("from", odt(from)).addValue("to", odt(to)).addValue("step", stepMinutes), rs -> {
            out.computeIfAbsent(rs.getLong("app_id"), k -> new ArrayList<>())
                    .add(new Point(instant(rs, "bucket"), rs.getInt("rank")));
        });
        return out;
    }

    // ------------------------------------------------------------------ apps

    public Optional<AppRow> app(String appleAppId) {
        return jdbc.query("""
                SELECT a.id, a.apple_app_id, a.bundle_id, d.name AS developer, d.apple_developer_id,
                       to_char(a.release_date, 'YYYY-MM-DD') AS release_date, a.first_seen_at, a.last_seen_at
                FROM app a LEFT JOIN developer d ON d.id = a.developer_id
                WHERE a.apple_app_id = :id
                """, Map.of("id", appleAppId), (rs, i) -> new AppRow(
                rs.getLong("id"), rs.getString("apple_app_id"), rs.getString("bundle_id"), rs.getString("developer"),
                rs.getString("apple_developer_id"), rs.getString("release_date"),
                instant(rs, "first_seen_at"), instant(rs, "last_seen_at"))).stream().findFirst();
    }

    /** Latest listing (from the chart feed) merged with the latest Lookup details, per country. */
    public List<CountryListing> listings(long appId) {
        return jdbc.query("""
                WITH countries AS (
                    SELECT country_code FROM v_app_listing_latest WHERE app_id = :app
                    UNION SELECT country_code FROM v_app_metadata_latest WHERE app_id = :app)
                SELECT c.country_code,
                       COALESCE(m.name, l.name) AS name, m.developer_name, COALESCE(m.description, l.summary) AS description,
                       COALESCE(m.icon_url, l.icon_url) AS icon_url, COALESCE(m.store_url, l.store_url) AS store_url,
                       COALESCE(m.price, l.price_amount) AS price, COALESCE(m.currency, l.currency) AS currency,
                       m.age_rating, m.version, m.version_released_at, m.release_notes, m.size_bytes, m.languages,
                       CAST(m.screenshot_urls AS text) AS screenshot_urls,
                       rt.rating, rt.rating_count, chk.status AS details_status, chk.last_checked_at
                FROM countries c
                LEFT JOIN v_app_listing_latest  l   ON l.app_id = :app  AND l.country_code = c.country_code
                LEFT JOIN v_app_metadata_latest m   ON m.app_id = :app  AND m.country_code = c.country_code
                LEFT JOIN v_app_rating_latest   rt  ON rt.app_id = :app AND rt.country_code = c.country_code
                LEFT JOIN app_metadata_check    chk ON chk.app_id = :app AND chk.country_code = c.country_code
                ORDER BY c.country_code
                """, Map.of("app", appId), (rs, i) -> new CountryListing(
                rs.getString("country_code"),
                rs.getString("name"),
                rs.getString("developer_name"),
                rs.getString("description"),
                rs.getString("icon_url"),
                rs.getString("store_url"),
                rs.getBigDecimal("price"),
                rs.getString("currency"),
                rs.getString("age_rating"),
                rs.getString("version"),
                instant(rs, "version_released_at"),
                rs.getString("release_notes"),
                (Long) rs.getObject("size_bytes"),
                rs.getString("languages"),
                jsonList(rs.getString("screenshot_urls")),
                rs.getBigDecimal("rating"),
                (Integer) rs.getObject("rating_count"),
                rs.getString("details_status"),
                instant(rs, "last_checked_at")));
    }

    /** Performance of an app in every chart it has appeared in. */
    public List<ChartPerformance> performance(long appId) {
        record Row(long chartId, ChartPerformance perf) {
        }
        List<Row> rows = jdbc.query("""
                SELECT st.chart_id, vc.chart_key, cur.slot_start AS as_of, st.current_rank, st.in_chart,
                       st.best_rank, st.best_rank_at, st.worst_rank, st.first_observed_at, st.in_chart_since, st.rising,
                       w1.rank AS rank_24h_ago, w7.rank AS rank_7d_ago,
                       (SELECT round(avg(r.rank), 1) FROM ranking r JOIN snapshot s ON s.id = r.snapshot_id AND s.status = 'VALID'
                         WHERE r.chart_id = st.chart_id AND r.app_id = st.app_id
                           AND r.slot_start > cur.slot_start - interval '30 days') AS avg_rank_30d
                FROM app_chart_state st
                JOIN v_chart vc ON vc.id = st.chart_id
                CROSS JOIN LATERAL (SELECT slot_start FROM snapshot
                                     WHERE chart_id = st.chart_id AND status = 'VALID' AND processed_at IS NOT NULL
                                     ORDER BY slot_start DESC LIMIT 1) cur
                LEFT JOIN LATERAL (SELECT r.rank FROM (SELECT id FROM snapshot
                                     WHERE chart_id = st.chart_id AND status = 'VALID' AND processed_at IS NOT NULL
                                       AND slot_start <= cur.slot_start - interval '24 hours'
                                     ORDER BY slot_start DESC LIMIT 1) s
                                   JOIN ranking r ON r.snapshot_id = s.id AND r.app_id = st.app_id) w1 ON true
                LEFT JOIN LATERAL (SELECT r.rank FROM (SELECT id FROM snapshot
                                     WHERE chart_id = st.chart_id AND status = 'VALID' AND processed_at IS NOT NULL
                                       AND slot_start <= cur.slot_start - interval '7 days'
                                     ORDER BY slot_start DESC LIMIT 1) s
                                   JOIN ranking r ON r.snapshot_id = s.id AND r.app_id = st.app_id) w7 ON true
                WHERE st.app_id = :app
                ORDER BY st.current_rank NULLS LAST, vc.chart_key
                """, Map.of("app", appId), (rs, i) -> {
            Integer cur = (Integer) rs.getObject("current_rank");
            Integer r24 = (Integer) rs.getObject("rank_24h_ago");
            Integer r7 = (Integer) rs.getObject("rank_7d_ago");
            java.math.BigDecimal avg = rs.getBigDecimal("avg_rank_30d");
            return new Row(rs.getLong("chart_id"), new ChartPerformance(
                    rs.getString("chart_key"),
                    instant(rs, "as_of"),
                    cur,
                    rs.getBoolean("in_chart"),
                    cur != null && r24 != null ? r24 - cur : null,
                    cur != null && r7 != null ? r7 - cur : null,
                    (Integer) rs.getObject("best_rank"),
                    instant(rs, "best_rank_at"),
                    (Integer) rs.getObject("worst_rank"),
                    instant(rs, "first_observed_at"),
                    instant(rs, "in_chart_since"),
                    rs.getBoolean("rising"),
                    avg == null ? null : avg.doubleValue(),
                    Map.of()));
        });

        List<ChartPerformance> out = new ArrayList<>(rows.size());
        for (Row row : rows) {
            ChartPerformance p = row.perf();
            long chartId = row.chartId();
            Map<String, Double> hours = new LinkedHashMap<>();
            jdbc.query("""
                    SELECT tier, round(sum(extract(epoch FROM (COALESCE(ended_at, :asOf) - started_at))) / 3600.0, 1) AS hours
                    FROM tier_interval WHERE chart_id = :chart AND app_id = :app
                    GROUP BY tier ORDER BY tier
                    """, new MapSqlParameterSource("chart", chartId).addValue("app", appId).addValue("asOf", odt(p.asOf())),
                    rs -> {
                        int tier = rs.getInt("tier");
                        hours.put(tier == 1 ? "number_one" : "top_" + tier, rs.getBigDecimal("hours").doubleValue());
                    });
            out.add(new ChartPerformance(p.chart(), p.asOf(), p.currentRank(), p.inChart(),
                    p.change24h(), p.change7d(), p.bestRank(), p.bestRankAt(), p.worstRank(), p.firstObservedAt(),
                    p.inChartSince(), p.rising(), p.averageRank30d(), hours));
        }
        return out;
    }

    public List<ListingVersion> listingVersions(long appId) {
        return jdbc.query("""
                SELECT country_code, name, title, price_amount, currency, icon_url, first_seen_at, last_seen_at
                FROM app_listing_version WHERE app_id = :app ORDER BY country_code, first_seen_at DESC
                """, Map.of("app", appId), (rs, i) -> new ListingVersion(
                rs.getString("country_code"), rs.getString("name"), rs.getString("title"),
                rs.getBigDecimal("price_amount"), rs.getString("currency"), rs.getString("icon_url"),
                instant(rs, "first_seen_at"), instant(rs, "last_seen_at")));
    }

    public List<DetailsVersion> detailsVersions(long appId) {
        return jdbc.query("""
                SELECT country_code, name, version, version_released_at, release_notes, size_bytes, first_seen_at, last_seen_at
                FROM app_metadata_version WHERE app_id = :app ORDER BY country_code, first_seen_at DESC
                """, Map.of("app", appId), (rs, i) -> new DetailsVersion(
                rs.getString("country_code"), rs.getString("name"), rs.getString("version"),
                instant(rs, "version_released_at"), rs.getString("release_notes"), (Long) rs.getObject("size_bytes"),
                instant(rs, "first_seen_at"), instant(rs, "last_seen_at")));
    }

    public List<RatingPoint> ratings(long appId, Instant from) {
        return jdbc.query("""
                SELECT country_code, to_char(day, 'YYYY-MM-DD') AS day, rating, rating_count
                FROM app_rating_daily WHERE app_id = :app AND day >= CAST(:from AS date)
                ORDER BY country_code, day
                """, new MapSqlParameterSource("app", appId).addValue("from", odt(from)),
                (rs, i) -> new RatingPoint(rs.getString("country_code"), rs.getString("day"),
                        rs.getBigDecimal("rating"), (Integer) rs.getObject("rating_count")));
    }

    /** Apps whose name or developer matches, with their current rank in each chart. */
    public List<ApiModel.SearchResult> search(String q, int limit) {
        String like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        List<Long> ids = new ArrayList<>();
        List<String> countries = new ArrayList<>();
        jdbc.query("""
                SELECT DISTINCT ON (a.id) a.id, COALESCE(l.country_code, 'us') AS country
                FROM app a
                LEFT JOIN v_app_listing_latest l ON l.app_id = a.id
                LEFT JOIN v_app_metadata_latest m ON m.app_id = a.id
                LEFT JOIN developer d ON d.id = a.developer_id
                WHERE l.name ILIKE :like OR m.name ILIKE :like OR d.name ILIKE :like
                   OR a.apple_app_id = :exact OR a.bundle_id = :exact
                ORDER BY a.id, a.last_seen_at DESC
                LIMIT :limit
                """, new MapSqlParameterSource("like", like).addValue("exact", q).addValue("limit", limit), rs -> {
            ids.add(rs.getLong("id"));
            countries.add(rs.getString("country"));
        });

        List<ApiModel.SearchResult> out = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            long appId = ids.get(i);
            AppCard card = cards(countries.get(i), List.of(appId)).get(appId);
            List<ChartRank> ranks = jdbc.query("""
                    SELECT vc.chart_key, st.current_rank FROM app_chart_state st JOIN v_chart vc ON vc.id = st.chart_id
                    WHERE st.app_id = :app AND st.current_rank IS NOT NULL ORDER BY st.current_rank
                    """, Map.of("app", appId), (rs, n) -> new ChartRank(rs.getString("chart_key"), rs.getInt("current_rank")));
            out.add(new ApiModel.SearchResult(card, ranks));
        }
        return out;
    }

    // --------------------------------------------------------------- helpers

    static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime t = rs.getObject(column, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    static OffsetDateTime odt(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static List<String> jsonList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return JSON.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of();
        }
    }
}
