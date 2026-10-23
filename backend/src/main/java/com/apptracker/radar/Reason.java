package com.apptracker.radar;

/**
 * Why an app is on the Radar (the reason chips). The score is the sum of the
 * points; the points live here and only here, so they are easy to tune.
 */
public enum Reason {
    NEW_APP(2),            // released by Apple 90 days ago or less
    NEW_IN_CHARTS(2),      // first seen in the scope's charts within the period, after the warm-up
    CLIMBING(2),           // gained 10 places or more over the period, or bottom half to top half
    STEADY(1),             // rank improved in 60% of the steps or more (4 readings or more)
    RATINGS_GROWING(2),    // rating count +30% and +20 ratings or more over 7 days
    RATINGS_FAST(1),       // rating growth in the top 10% of the scope's ranked apps
    UNKNOWN_THEME(2),      // name and subtitle match no known theme
    HAS_FOLLOWERS(3),      // originator of a cluster with 2 followers or more
    MULTI_COUNTRY(1),      // ranks in 2 enabled countries or more
    NEW_DEVELOPER(1);      // the developer is new to the tracker

    public final int points;

    Reason(int points) {
        this.points = points;
    }
}
