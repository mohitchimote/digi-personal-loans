package com.digibank.notification.config;

/** Mirrors the Worker's AppError: a message plus the HTTP status to answer with (default 400). */
public class AppException extends RuntimeException {
    private final int status;

    public AppException(String message) {
        this(message, 400);
    }

    public AppException(String message, int status) {
        super(message);
        this.status = status;
    }

    public int getStatus() { return status; }
}
