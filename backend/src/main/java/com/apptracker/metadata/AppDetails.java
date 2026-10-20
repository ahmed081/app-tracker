package com.apptracker.metadata;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

/** One app as returned by Apple's Lookup API, normalized. */
public record AppDetails(
        String appleAppId,
        String name,
        String bundleId,
        String developerName,
        String sellerName,
        String appleDeveloperId,
        String description,
        BigDecimal price,
        String currency,
        String formattedPrice,
        String ageRating,
        String version,
        Instant versionReleasedAt,
        String releaseNotes,
        Instant releasedAt,
        Long sizeBytes,
        String minimumOsVersion,
        List<String> languages,
        Integer primaryGenreId,
        String primaryGenreName,
        List<String> genreIds,
        String iconUrl,
        List<String> screenshotUrls,
        List<String> ipadScreenshotUrls,
        String websiteUrl,
        String storeUrl,
        // Ratings change daily; they are stored in app_rating_daily, not in the hash.
        BigDecimal rating,
        Integer ratingCount,
        BigDecimal ratingCurrentVersion,
        Integer ratingCountCurrentVersion) {

    /** Hash of everything except ratings: a new version row is written only when it changes. */
    public String contentHash() {
        String joined = String.join("\u0001",
                s(name), s(bundleId), s(developerName), s(sellerName), s(appleDeveloperId), s(description),
                s(price), s(currency), s(formattedPrice), s(ageRating), s(version), s(versionReleasedAt),
                s(releaseNotes), s(releasedAt), s(sizeBytes), s(minimumOsVersion), String.join(",", languages),
                s(primaryGenreId), s(primaryGenreName), String.join(",", genreIds), s(iconUrl),
                String.join(",", screenshotUrls), String.join(",", ipadScreenshotUrls), s(websiteUrl), s(storeUrl));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(joined.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String s(Object o) {
        return o == null ? "" : o.toString();
    }
}
