package com.apptracker.manage;

import java.util.Map;

/** Invalid request fields; answered with 400 and {"errors": {field: message}}. */
public class ValidationException extends RuntimeException {

    private final Map<String, String> errors;

    public ValidationException(Map<String, String> errors) {
        super("Invalid fields: " + errors.keySet());
        this.errors = Map.copyOf(errors);
    }

    public ValidationException(String field, String message) {
        this(Map.of(field, message));
    }

    public Map<String, String> errors() {
        return errors;
    }
}
