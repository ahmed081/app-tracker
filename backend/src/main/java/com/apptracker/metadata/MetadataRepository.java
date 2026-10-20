package com.apptracker.metadata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@Repository
public class MetadataRepository {

    /** An app to look up in one country. */
    public record Target(long appId, String appleAppId, String countryCode) {
    }

    private static final ObjectMapper JSON = new ObjectMapper();
    private final NamedParameterJdbcTemplate jdbc;

    public MetadataRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Apps that charted recently in a country and have never been looked up
     * there, are due for their daily refresh, or failed a while ago.
     */
    public List<Target> findTargets(int seenWithinDays, int refreshAfterHours, int retryErrorAfterMinutes, int limit) {
        String sql = """
                WITH seen AS (
                    SELECT DISTINCT r.app_id, c.country_code
                    FROM ranking r
                    JOIN chart c ON c.id = r.chart_id
                    WHERE r.slot_start > now() - make_interval(days => :seenDays)
                )
                SELECT s.app_id, a.apple_app_id, s.country_code
                FROM seen s
                JOIN app a ON a.id = s.app_id
                LEFT JOIN app_metadata_check m
                       ON m.app_id = s.app_id AND m.country_code = s.country_code
                WHERE m.app_id IS NULL
                   OR (m.status <> 'ERROR' AND m.last_checked_at < now() - make_interval(hours => :refreshHours))
                   OR (m.status = 'ERROR'  AND m.last_checked_at < now() - make_interval(mins => :retryMinutes))
                ORDER BY m.last_checked_at NULLS FIRST, s.app_id
                LIMIT :limit
                """;
        return jdbc.query(sql, new MapSqlParameterSource()
                        .addValue("seenDays", seenWithinDays)
                        .addValue("refreshHours", refreshAfterHours)
                        .addValue("retryMinutes", retryErrorAfterMinutes)
                        .addValue("limit", limit),
                (rs, i) -> new Target(rs.getLong("app_id"), rs.getString("apple_app_id"), rs.getString("country_code")));
    }

    public void insertRawLookup(String countryCode, Instant at, String url, List<String> ids,
                                AppleHttpClient.Response res) {
        jdbc.update("""
                INSERT INTO raw_lookup (country_code, collected_at, url, requested_ids, http_status, body, error)
                VALUES (:country, :at, :url, :ids, :status, :body, :error)
                """, new MapSqlParameterSource()
                .addValue("country", countryCode)
                .addValue("at", odt(at))
                .addValue("url", url)
                .addValue("ids", String.join(",", ids))
                .addValue("status", res.status())
                .addValue("body", res.body())
                .addValue("error", res.error()));
    }

    public void recordCheck(long appId, String countryCode, String status, Instant at) {
        jdbc.update("""
                INSERT INTO app_metadata_check (app_id, country_code, status, last_checked_at, last_ok_at)
                VALUES (:app, :country, :status, :at,
                        CASE WHEN CAST(:status AS text) = 'OK' THEN CAST(:at AS timestamptz) END)
                ON CONFLICT (app_id, country_code) DO UPDATE
                   SET status = EXCLUDED.status,
                       last_checked_at = EXCLUDED.last_checked_at,
                       last_ok_at = COALESCE(EXCLUDED.last_ok_at, app_metadata_check.last_ok_at)
                """, new MapSqlParameterSource()
                .addValue("app", appId)
                .addValue("country", countryCode)
                .addValue("status", status)
                .addValue("at", odt(at)));
    }

    /** Insert a new version if the details changed, otherwise extend the latest one. */
    public void saveVersion(long appId, String countryCode, AppDetails d, Instant at) {
        String hash = d.contentHash();
        MapSqlParameterSource key = new MapSqlParameterSource()
                .addValue("app", appId).addValue("country", countryCode)
                .addValue("hash", hash).addValue("at", odt(at));

        int extended = jdbc.update("""
                UPDATE app_metadata_version SET last_seen_at = GREATEST(last_seen_at, :at)
                WHERE id = (SELECT id FROM app_metadata_version
                            WHERE app_id = :app AND country_code = :country
                            ORDER BY first_seen_at DESC, id DESC LIMIT 1)
                  AND content_hash = :hash
                """, key);
        if (extended > 0) return;

        jdbc.update("""
                INSERT INTO app_metadata_version
                    (app_id, country_code, name, developer_name, seller_name, apple_developer_id, description,
                     price, currency, formatted_price, age_rating, version, version_released_at, release_notes,
                     released_at, size_bytes, minimum_os_version, languages, primary_genre_id, primary_genre_name,
                     genre_ids, icon_url, screenshot_urls, ipad_screenshot_urls, website_url, store_url,
                     content_hash, first_seen_at, last_seen_at)
                VALUES
                    (:app, :country, :name, :developerName, :sellerName, :developerId, :description,
                     :price, :currency, :formattedPrice, :ageRating, :version, :versionReleasedAt, :releaseNotes,
                     :releasedAt, :sizeBytes, :minimumOs, :languages, :primaryGenreId, :primaryGenreName,
                     :genreIds, :iconUrl, CAST(:screenshots AS jsonb), CAST(:ipadScreenshots AS jsonb),
                     :websiteUrl, :storeUrl, :hash, :at, :at)
                """, key
                .addValue("name", d.name())
                .addValue("developerName", d.developerName())
                .addValue("sellerName", d.sellerName())
                .addValue("developerId", d.appleDeveloperId())
                .addValue("description", d.description())
                .addValue("price", d.price())
                .addValue("currency", d.currency())
                .addValue("formattedPrice", d.formattedPrice())
                .addValue("ageRating", d.ageRating())
                .addValue("version", d.version())
                .addValue("versionReleasedAt", ts(d.versionReleasedAt()))
                .addValue("releaseNotes", d.releaseNotes())
                .addValue("releasedAt", ts(d.releasedAt()))
                .addValue("sizeBytes", d.sizeBytes())
                .addValue("minimumOs", d.minimumOsVersion())
                .addValue("languages", String.join(",", d.languages()))
                .addValue("primaryGenreId", d.primaryGenreId())
                .addValue("primaryGenreName", d.primaryGenreName())
                .addValue("genreIds", String.join(",", d.genreIds()))
                .addValue("iconUrl", d.iconUrl())
                .addValue("screenshots", json(d.screenshotUrls()))
                .addValue("ipadScreenshots", json(d.ipadScreenshotUrls()))
                .addValue("websiteUrl", d.websiteUrl())
                .addValue("storeUrl", d.storeUrl()));
    }

    /** One rating row per app, country and day (UTC); later checks the same day overwrite it. */
    public void saveRating(long appId, String countryCode, AppDetails d, Instant at) {
        if (d.rating() == null && d.ratingCount() == null) return;
        jdbc.update("""
                INSERT INTO app_rating_daily (app_id, country_code, day, rating, rating_count,
                                              rating_current_version, rating_count_current_version, updated_at)
                VALUES (:app, :country, :day, :rating, :count, :ratingCv, :countCv, :at)
                ON CONFLICT (app_id, country_code, day) DO UPDATE
                   SET rating = EXCLUDED.rating,
                       rating_count = EXCLUDED.rating_count,
                       rating_current_version = EXCLUDED.rating_current_version,
                       rating_count_current_version = EXCLUDED.rating_count_current_version,
                       updated_at = EXCLUDED.updated_at
                """, new MapSqlParameterSource()
                .addValue("app", appId)
                .addValue("country", countryCode)
                .addValue("day", LocalDate.ofInstant(at, ZoneOffset.UTC))
                .addValue("rating", d.rating())
                .addValue("count", d.ratingCount())
                .addValue("ratingCv", d.ratingCurrentVersion())
                .addValue("countCv", d.ratingCountCurrentVersion())
                .addValue("at", odt(at)));
    }

    private static OffsetDateTime ts(Instant i) {
        return i == null ? null : odt(i);
    }

    private static String json(List<String> list) {
        try {
            return JSON.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    static OffsetDateTime odt(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
