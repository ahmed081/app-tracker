package com.apptracker.radar;

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
 * db/radar.sql on a real PostgreSQL. Runs only when TEST_JDBC_URL is set (see
 * WatchlistMigrationTest). Everything happens in one transaction that is rolled
 * back, so the database is left as it was.
 */
@EnabledIfEnvironmentVariable(named = "TEST_JDBC_URL", matches = ".+")
class RadarMigrationTest {

    @Test
    void createsTheTablesSeedsThemesAndKeepsTheBackendFromDeleting() throws Exception {
        String script = Files.readString(Path.of("db/radar.sql"))
                .replaceAll("(?m)^(BEGIN|COMMIT);$", "");      // the test's own transaction wraps it
        try (Connection c = DriverManager.getConnection(System.getenv("TEST_JDBC_URL"))) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute(script);
                s.execute(script);                              // safe to run twice

                assertEquals(14, count(s, "SELECT count(*) FROM radar_theme WHERE name IN ('Tongits', 'Pusoy', 'Slots', "
                        + "'Bingo', 'Poker', 'Mahjong', 'Sabong', 'Ludo', 'Domino', 'Chess', 'Solitaire', 'Lucky 9', "
                        + "'Sakla', 'Color game')"));
                assertEquals(1, count(s, "SELECT count(*) FROM radar_theme WHERE name = 'Lucky 9' "
                        + "AND keywords = '{\"lucky 9\",\"lucky nine\"}'"));

                long app = count(s, "INSERT INTO app (apple_app_id, first_seen_at, last_seen_at) "
                        + "VALUES ('test-radar-1', now(), now()) RETURNING id");

                s.execute("SET LOCAL ROLE app_backend");
                long theme = count(s, "INSERT INTO radar_theme (name, keywords) VALUES ('Test theme', '{sakura}') RETURNING id");
                s.execute("UPDATE radar_theme SET active = false, keywords = '{sakura,spin}' WHERE id = " + theme);
                fails(c, s, "INSERT INTO radar_theme (name, keywords) VALUES ('Test theme', '{x}')", "23505");
                s.execute("INSERT INTO radar_dismissal (app_id) VALUES (" + app + ")");
                s.execute("INSERT INTO radar_dismissal (app_id, active) VALUES (" + app + ", false) "
                        + "ON CONFLICT (app_id) DO UPDATE SET active = EXCLUDED.active, updated_at = now()");
                fails(c, s, "DELETE FROM radar_theme WHERE id = " + theme, "42501");
                fails(c, s, "DELETE FROM radar_dismissal WHERE app_id = " + app, "42501");
                fails(c, s, "TRUNCATE radar_theme", "42501");
            } finally {
                c.rollback();
            }
        }
    }

    private static long count(Statement s, String sql) throws SQLException {
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
