package com.apptracker.manage;

/** The request clashes with what exists (duplicate, job already running); answered with 409. */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
