package com.apptracker.watch;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * db/watchlist.sql on a real PostgreSQL. Runs only when TEST_JDBC_URL is set, e.g.
 * jdbc:postgresql://localhost:5432/apptracker_test?user=apptracker&password=...
 * The database needs the collector's schema and db/schema.sql (so app_backend
 * exists), and an admin login. Everything happens in one transaction that is
 * rolled back, so the database is left as it was.
 */
@EnabledIfEnvironmentVariable(named = "TEST_JDBC_URL", matches = ".+")
class WatchlistMigrationTest {

    @Test
    void createsTheTablesAndKeepsTheBackendFromDeleting() throws Exception {
        String script = Files.readString(Path.of("db/watchlist.sql"))
                .replaceAll("(?m)^(BEGIN|COMMIT);$", "");      // the test's own transaction wraps it
        try (Connection c = DriverManager.getConnection(System.getenv("TEST_JDBC_URL"))) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute(script);
                s.execute(script);                              // safe to run twice

                s.execute("INSERT INTO country (code, name) VALUES ('zz', 'Test') ON CONFLICT DO NOTHING");
                s.execute("INSERT INTO genre (id, name) VALUES (999001, 'Test') ON CONFLICT DO NOTHING");
                long chart = id(s, """
                        INSERT INTO chart (country_code, genre_id, chart_type, depth, interval_minutes)
                        VALUES ('zz', 999001, 'TOP_FREE', 100, 720) RETURNING id""");
                long app = id(s, "INSERT INTO app (apple_app_id, first_seen_at, last_seen_at) "
                        + "VALUES ('test-999001', now(), now()) RETURNING id");

                long inChart = id(s, "INSERT INTO watch (kind, app_id, chart_id) VALUES ('APP', %d, %d) RETURNING id"
                        .formatted(app, chart));
                id(s, "INSERT INTO watch (kind, app_id) VALUES ('APP', %d) RETURNING id".formatted(app));
                id(s, "INSERT INTO watch (kind, chart_id) VALUES ('CHART', %d) RETURNING id".formatted(chart));
                s.execute("INSERT INTO alert_rule (watch_id) VALUES (%d)".formatted(inChart));

                // The kind must match its target.
                fails(c, s, "INSERT INTO watch (kind, app_id, chart_id) VALUES ('CHART', %d, %d)".formatted(app, chart), "23514");
                fails(c, s, "INSERT INTO watch (kind) VALUES ('APP')", "23514");
                // One watch per target, NULL chart included (NULLS NOT DISTINCT).
                fails(c, s, "INSERT INTO watch (kind, app_id) VALUES ('APP', %d)".formatted(app), "23505");
                // Presets keep no custom settings.
                fails(c, s, "UPDATE alert_rule SET min_places = 5 WHERE watch_id = %d".formatted(inChart), "23514");

                s.execute("SET LOCAL ROLE app_backend");
                s.execute("UPDATE watch SET active = false WHERE id = %d".formatted(inChart));
                s.execute("""
                        UPDATE alert_rule SET preset = 'CUSTOM', event_types = '{BIG_MOVE}', min_places = 5, tiers = '{10}'
                        WHERE watch_id = %d""".formatted(inChart));
                fails(c, s, "INSERT INTO watch (kind, app_id) VALUES ('APP', %d)".formatted(app), "23505");
                id(s, "INSERT INTO watch (kind, app_id, chart_id) VALUES ('APP', %d, %d) "
                        .formatted(app, chart) + "ON CONFLICT ON CONSTRAINT watch_unique DO UPDATE SET active = true RETURNING id");
                fails(c, s, "DELETE FROM watch WHERE id = %d".formatted(inChart), "42501");
                fails(c, s, "DELETE FROM alert_rule WHERE watch_id = %d".formatted(inChart), "42501");
            } finally {
                c.rollback();
            }
        }
    }

    private static long id(Statement s, String sql) throws SQLException {
        try (var rs = s.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    /** The statement fails with this SQLSTATE; the transaction carries on. */
    private static void fails(Connection c, Statement s, String sql, String sqlState) throws SQLException {
        Savepoint sp = c.setSavepoint();
        SQLException e = assertThrows(SQLException.class, () -> s.execute(sql), sql);
        assertEquals(sqlState, e.getSQLState(), sql + ": " + e.getMessage());
        c.rollback(sp);
    }
}
