package com.digibank.auth.access;

/**
 * A refusal from an admin operation, answered as {"success":false,"message":...,"data":null} with the
 * given status (400 unless stated), which is what the Worker's AppError produces, so the same admin
 * screens read both backends the same way.
 */
public class AdminApiException extends RuntimeException {

    private final int status;

    public AdminApiException(String message) {
        this(message, 400);
    }

    public AdminApiException(String message, int status) {
        super(message);
        this.status = status;
    }

    public int getStatus() { return status; }
}
