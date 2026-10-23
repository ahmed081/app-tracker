package com.apptracker.radar;

import com.apptracker.api.ApiModel.AppCard;
import com.apptracker.api.ApiModel.Point;

import java.time.Instant;
import java.util.List;

/** JSON shapes of the Radar API (/api/radar). Request bodies: null = leave unchanged. */
public final class RadarModel {

    private RadarModel() {
    }

    /**
     * An app on the Radar (Newcomers, Rising from the bottom), in one chart of the scope.
     *
     * @param chart                the chart of the numbers below: the best current rank (newcomers) or the climb
     * @param startRank            rank in the chart's first reading of the period; null = not ranked then
     * @param placesGained         first rank of the period minus the current rank; null when not ranked now
     * @param ratingsGained        rating count gained over 7 days; null with fewer than 2 daily rows
     * @param ratingsGrowthPercent the same in percent; null without data or from 0 ratings
     * @param ageDays              days since Apple's release date
     * @param firstSeenAt          first appearance in the scope's charts
     * @param reasons              reason chips, in display order (see Reason)
     * @param trend                best rank per step over the period
     */
    public record RadarApp(
            AppCard app,
            String chart,
            Integer currentRank,
            Integer startRank,
            Integer placesGained,
            Integer ratingsGained,
            Double ratingsGrowthPercent,
            Integer ageDays,
            Instant firstSeenAt,
            List<String> reasons,
            int score,
            boolean dismissed,
            List<Point> trend) {
    }

    /** An emerging word (or a word seen abroad, not here yet), with the apps using it, earliest first. */
    public record RadarWord(String word, int appCount, int developerCount, Instant firstSeenAt, List<AppCard> apps) {
    }

    /**
     * A possible new niche.
     *
     * @param chart        the chart of the originator's trend (its best current rank); null when it ranks nowhere now
     * @param word         the rare word most followers share with the originator; null when only the names are close
     * @param placesGained places gained over the period by the originator and followers together (gains only)
     * @param ratingsGained ratings gained over 7 days together; null without rating data
     * @param countries    enabled countries where at least one of them ranks now
     */
    public record RadarCluster(
            AppCard originator,
            String chart,
            Instant originatorFirstSeenAt,
            List<Point> trend,
            List<AppCard> followers,
            String word,
            int placesGained,
            Integer ratingsGained,
            int countries,
            boolean dismissed) {
    }

    /** @param since in that chart's Top 25 since */
    public record AbroadRank(String chart, String country, int rank, Instant since) {
    }

    /** @param ranks Top 25 ranks abroad, best first; @param countries every enabled country it ranks in now */
    public record RadarAbroad(AppCard app, List<AbroadRank> ranks, List<String> countries, boolean dismissed) {
    }

    /**
     * @param dataSince     the scope's first VALID reading
     * @param hiddenByScore app rows left out because their score is below minScore ("Show all")
     * @param notes         SHORT_HISTORY (less than 7 days of data), BASELINE_SHORT (less than the period
     *                      plus the 60-day baseline), ONLY_ONE_COUNTRY, NO_CHARTS (nothing tracked in the scope)
     */
    public record RadarResponse(
            String country,
            Integer genreId,
            String window,
            Instant asOf,
            Instant dataSince,
            boolean hideKnown,
            int minScore,
            int hiddenByScore,
            List<RadarApp> newcomers,
            List<RadarApp> risingFromBottom,
            List<RadarWord> emergingWords,
            List<RadarCluster> clusters,
            List<RadarAbroad> abroad,
            List<RadarWord> abroadWords,
            List<String> notes) {
    }

    public record Theme(long id, String name, List<String> keywords, boolean active, Instant createdAt,
                        Instant updatedAt) {
    }

    /** Create: name and keywords required. Change: any of the three. */
    public record ThemeRequest(String name, List<String> keywords, Boolean active) {
    }

    /** {active: true} hides the app from the Radar, {active: false} shows it again. */
    public record DismissRequest(String appleAppId, Boolean active) {
    }

    public record Dismissal(String appleAppId, boolean active) {
    }
}
