package com.apptracker.events;

/**
 * Ranking event types, declared from most to least important. When one app
 * triggers several events in one snapshot, the first in this order is primary.
 */
public enum EventType {
    REACHED_NUMBER_ONE(Importance.HIGH),
    LOST_NUMBER_ONE(Importance.HIGH),
    ENTERED_TOP_N(Importance.HIGH),
    LEFT_TOP_N(Importance.HIGH),
    NEW_ENTRY(Importance.MEDIUM),
    RE_ENTRY(Importance.MEDIUM),
    LEFT_CHART(Importance.MEDIUM),
    NEW_BEST(Importance.LOW),           // frequent during a climb; kept for app pages
    BIG_MOVE(Importance.MEDIUM),
    RISING_STARTED(Importance.MEDIUM),
    RISING_ENDED(Importance.MEDIUM),
    MOVED_UP(Importance.LOW),
    MOVED_DOWN(Importance.LOW),
    FIRST_OBSERVED(Importance.NONE);

    private final int importance;

    EventType(int importance) {
        this.importance = importance;
    }

    public int importance() {
        return importance;
    }

    /** Importance levels stored in chart_event.importance. */
    public static final class Importance {
        public static final int NONE = 0;
        public static final int LOW = 1;
        public static final int MEDIUM = 2;
        public static final int HIGH = 3;

        private Importance() {
        }
    }
}
