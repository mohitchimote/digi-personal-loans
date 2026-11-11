package com.digibank.application.config;

/**
 * A business-rule failure with its own HTTP status, rendered as the same { success:false, message,
 * data:null } body the Worker's AppError produces (see GlobalExceptionHandler).
 */
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() { return status; }
}
