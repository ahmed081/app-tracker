package com.apptracker.events;

import com.apptracker.events.EngineModel.Event;
import com.apptracker.events.EngineModel.TierAction;
import com.apptracker.events.EngineModel.TierChange;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class EventRepository {

    public record SnapshotRef(long id, Instant slot) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public EventRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ reads

    public List<Long> chartsWithPendingSnapshots() {
        return jdbc.queryForList("""
                SELECT DISTINCT chart_id FROM snapshot
                WHERE status = 'VALID' AND processed_at IS NULL
                ORDER BY chart_id
                """, Map.of(), Long.class);
    }

    /** Every chart with at least one VALID snapshot (what a full rebuild replays). */
    public List<Long> chartsWithValidSnapshots() {
        return jdbc.queryForList("SELECT DISTINCT chart_id FROM snapshot WHERE status = 'VALID' ORDER BY chart_id",
                Map.of(), Long.class);
    }

    /**
     * True when a pending snapshot is older than one already processed (an
     * out-of-order import, or a FAILED slot later replaced): the chart must be rebuilt.
     */
    public boolean needsRebuild(long chartId) {
        Boolean b = jdbc.queryForObject("""
                SELECT COALESCE(
                    (SELECT min(slot_start) FROM snapshot
                      WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NULL)
                    <
                    (SELECT max(slot_start) FROM snapshot
                      WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NOT NULL),
                    false)
                """, Map.of("chart", chartId), Boolean.class);
        return Boolean.TRUE.equals(b);
    }

    public List<SnapshotRef> pendingSnapshots(long chartId) {
        return jdbc.query("""
                SELECT id, slot_start FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NULL
                ORDER BY slot_start
                """, Map.of("chart", chartId), (rs, i) -> new SnapshotRef(rs.getLong("id"), instant(rs, "slot_start")));
    }

    public int chartInterval(long chartId) {
        Integer v = jdbc.queryForObject("SELECT interval_minutes FROM chart WHERE id = :chart",
                Map.of("chart", chartId), Integer.class);
        return v == null ? 60 : v;
    }

    /** The latest processed VALID snapshot before {@code slot}. */
    public Optional<SnapshotRef> previousProcessed(long chartId, Instant slot) {
        return jdbc.query("""
                SELECT id, slot_start FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NOT NULL
                  AND slot_start < :slot
                ORDER BY slot_start DESC LIMIT 1
                """, new MapSqlParameterSource("chart", chartId).addValue("slot", odt(slot)),
                (rs, i) -> new SnapshotRef(rs.getLong("id"), instant(rs, "slot_start"))).stream().findFirst();
    }

    /** Slot of the chart's first processed VALID snapshot. */
    public Optional<Instant> baselineSlot(long chartId) {
        return jdbc.query("""
                SELECT min(slot_start) AS slot FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND processed_at IS NOT NULL
                """, Map.of("chart", chartId), (rs, i) -> instant(rs, "slot")).stream()
                .filter(java.util.Objects::nonNull).findFirst();
    }

    /** Slots of the chart's processed VALID snapshots up to {@code slot}, plus {@code slot} itself; oldest first. */
    public List<Instant> recentSlots(long chartId, Instant slot, int limit) {
        List<Instant> out = new ArrayList<>(jdbc.query("""
                SELECT slot_start FROM snapshot
                WHERE chart_id = :chart AND status = 'VALID' AND slot_start <= :slot
                  AND (processed_at IS NOT NULL OR slot_start = :slot)
                ORDER BY slot_start DESC
                LIMIT :limit
                """, new MapSqlParameterSource("chart", chartId).addValue("slot", odt(slot)).addValue("limit", limit),
                (rs, i) -> instant(rs, "slot_start")));
        Collections.reverse(out);
        return out;
    }

    public Map<Long, Integer> ranks(long snapshotId) {
        Map<Long, Integer> out = new HashMap<>();
        jdbc.query("SELECT app_id, rank FROM ranking WHERE snapshot_id = :s",
                Map.of("s", snapshotId), rs -> {
                    out.put(rs.getLong("app_id"), rs.getInt("rank"));
                });
        return out;
    }

    public Map<Long, AppState> states(long chartId, Collection<Long> appIds) {
        Map<Long, AppState> out = new HashMap<>();
        if (appIds.isEmpty()) return out;
        jdbc.query("""
                SELECT * FROM app_chart_state WHERE chart_id = :chart AND app_id IN (:apps)
                """, new MapSqlParameterSource("chart", chartId).addValue("apps", appIds), rs -> {
            AppState s = new AppState(
                    rs.getLong("app_id"),
                    (Integer) rs.getObject("current_rank"),
                    rs.getBoolean("in_chart"),
                    rs.getBoolean("ever_in_chart"),
                    instant(rs, "in_chart_since"),
                    (Integer) rs.getObject("best_rank"),
                    instant(rs, "best_rank_at"),
                    (Integer) rs.getObject("worst_rank"),
                    instant(rs, "first_observed_at"),
                    instant(rs, "last_seen_at"),
                    AppState.parseRecentRanks(rs.getString("recent_ranks")),
                    rs.getBoolean("rising"));
            out.put(s.appId(), s);
        });
        return out;
    }

    // ----------------------------------------------------------------- writes

    public void replaceEvents(long chartId, long snapshotId, Instant slot, Integer coveredMinutes, boolean gap,
                              List<Event> events, boolean notified) {
        jdbc.update("DELETE FROM chart_event WHERE snapshot_id = :s", Map.of("s", snapshotId));
        if (events.isEmpty()) return;
        SqlParameterSource[] batch = events.stream().map(e -> new MapSqlParameterSource()
                .addValue("chart", chartId)
                .addValue("app", e.appId())
                .addValue("snapshot", snapshotId)
                .addValue("type", e.type().name())
                .addValue("tier", e.tier())
                .addValue("prev", e.previousRank())
                .addValue("cur", e.currentRank())
                .addValue("at", odt(slot))
                .addValue("covered", coveredMinutes)
                .addValue("gap", gap)
                .addValue("importance", e.importance())
                .addValue("primary", e.primary())
                .addValue("notified", notified)).toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate("""
                INSERT INTO chart_event (chart_id, app_id, snapshot_id, event_type, tier, previous_rank,
                                         current_rank, occurred_at, covered_minutes, gap, importance,
                                         is_primary, notified)
                VALUES (:chart, :app, :snapshot, :type, :tier, :prev, :cur, :at, :covered, :gap, :importance,
                        :primary, :notified)
                """, batch);
    }

    public void saveStates(long chartId, long snapshotId, Collection<AppState> states) {
        if (states.isEmpty()) return;
        SqlParameterSource[] batch = states.stream().map(s -> new MapSqlParameterSource()
                .addValue("chart", chartId)
                .addValue("app", s.appId())
                .addValue("rank", s.currentRank())
                .addValue("inChart", s.inChart())
                .addValue("ever", s.everInChart())
                .addValue("since", ts(s.inChartSince()))
                .addValue("best", s.bestRank())
                .addValue("bestAt", ts(s.bestRankAt()))
                .addValue("worst", s.worstRank())
                .addValue("first", ts(s.firstObservedAt()))
                .addValue("lastSeen", ts(s.lastSeenAt()))
                .addValue("recent", s.recentRanksText())
                .addValue("rising", s.rising())
                .addValue("snapshot", snapshotId)).toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate("""
                INSERT INTO app_chart_state (chart_id, app_id, current_rank, in_chart, ever_in_chart, in_chart_since,
                                             best_rank, best_rank_at, worst_rank, first_observed_at, last_seen_at,
                                             recent_ranks, rising, last_snapshot_id, updated_at)
                VALUES (:chart, :app, :rank, :inChart, :ever, :since, :best, :bestAt, :worst, :first, :lastSeen,
                        :recent, :rising, :snapshot, now())
                ON CONFLICT (chart_id, app_id) DO UPDATE SET
                    current_rank = EXCLUDED.current_rank,
                    in_chart = EXCLUDED.in_chart,
                    ever_in_chart = EXCLUDED.ever_in_chart,
                    in_chart_since = EXCLUDED.in_chart_since,
                    best_rank = EXCLUDED.best_rank,
                    best_rank_at = EXCLUDED.best_rank_at,
                    worst_rank = EXCLUDED.worst_rank,
                    first_observed_at = EXCLUDED.first_observed_at,
                    last_seen_at = EXCLUDED.last_seen_at,
                    recent_ranks = EXCLUDED.recent_ranks,
                    rising = EXCLUDED.rising,
                    last_snapshot_id = EXCLUDED.last_snapshot_id,
                    updated_at = now()
                """, batch);
    }

    public void applyTierChanges(long chartId, List<TierChange> changes, List<TierChange> heldOverGap) {
        for (TierChange t : changes) {
            MapSqlParameterSource p = new MapSqlParameterSource()
                    .addValue("chart", chartId).addValue("app", t.appId())
                    .addValue("tier", t.tier()).addValue("at", odt(t.at()));
            if (t.action() == TierAction.OPEN) {
                jdbc.update("""
                        INSERT INTO tier_interval (chart_id, app_id, tier, started_at)
                        VALUES (:chart, :app, :tier, :at)
                        ON CONFLICT DO NOTHING
                        """, p);
            } else {
                jdbc.update("""
                        UPDATE tier_interval SET ended_at = :at
                        WHERE chart_id = :chart AND app_id = :app AND tier = :tier AND ended_at IS NULL
                        """, p);
            }
        }
        for (TierChange t : heldOverGap) {
            jdbc.update("""
                    UPDATE tier_interval SET uncertain = true
                    WHERE chart_id = :chart AND app_id = :app AND tier = :tier AND ended_at IS NULL
                    """, new MapSqlParameterSource("chart", chartId).addValue("app", t.appId()).addValue("tier", t.tier()));
        }
    }

    public void markProcessed(long snapshotId) {
        jdbc.update("UPDATE snapshot SET processed_at = now() WHERE id = :s", Map.of("s", snapshotId));
    }

    /** Wipe everything derived for a chart, so it can be replayed from its snapshots. */
    public void clearDerived(long chartId) {
        Map<String, Long> p = Map.of("chart", chartId);
        jdbc.update("DELETE FROM chart_event WHERE chart_id = :chart", p);
        jdbc.update("DELETE FROM tier_interval WHERE chart_id = :chart", p);
        jdbc.update("DELETE FROM app_chart_state WHERE chart_id = :chart", p);
        jdbc.update("UPDATE snapshot SET processed_at = NULL WHERE chart_id = :chart AND processed_at IS NOT NULL", p);
    }

    // ----------------------------------------------------------------- helpers

    static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime t = rs.getObject(column, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    private static OffsetDateTime ts(Instant i) {
        return i == null ? null : odt(i);
    }

    static OffsetDateTime odt(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
