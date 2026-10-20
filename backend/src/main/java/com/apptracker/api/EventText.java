package com.apptracker.api;

/** One readable sentence per event, e.g. "Tongits Go entered the Top 10 (#12 → #8)". */
final class EventText {

    private EventText() {
    }

    static String describe(String type, Integer tier, Integer prev, Integer cur, String app) {
        String name = app == null || app.isBlank() ? "An app" : app;
        String move = (prev != null ? "#" + prev : "unranked") + " → " + (cur != null ? "#" + cur : "out of the chart");
        return switch (type) {
            case "REACHED_NUMBER_ONE" -> name + " reached #1" + (prev != null ? " (from #" + prev + ")" : "");
            case "LOST_NUMBER_ONE" -> name + " lost #1 (" + move + ")";
            case "ENTERED_TOP_N" -> name + " entered the Top " + tier + " (" + move + ")";
            case "LEFT_TOP_N" -> name + " left the Top " + tier + " (" + move + ")";
            case "NEW_ENTRY" -> name + " entered the chart at #" + cur;
            case "RE_ENTRY" -> name + " re-entered the chart at #" + cur;
            case "LEFT_CHART" -> name + " left the chart" + (cur != null ? " (now #" + cur + ")" : "")
                    + (prev != null ? ", was #" + prev : "");
            case "NEW_BEST" -> name + " reached its best rank: #" + cur;
            case "BIG_MOVE" -> name + (cur != null && prev != null && cur < prev ? " jumped " : " dropped ") + move;
            case "RISING_STARTED" -> name + " is rising (now #" + cur + ")";
            case "RISING_ENDED" -> name + " stopped rising" + (cur != null ? " (#" + cur + ")" : "");
            case "MOVED_UP" -> name + " moved up " + move;
            case "MOVED_DOWN" -> name + " moved down " + move;
            case "FIRST_OBSERVED" -> name + " first observed" + (cur != null ? " at #" + cur : "");
            default -> name + ": " + type;
        };
    }
}
