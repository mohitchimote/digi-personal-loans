package com.digibank.workflow.service;

/** A business error with the HTTP status the Worker would answer with (its AppError). */
public class WorkflowException extends RuntimeException {
    private final int status;

    public WorkflowException(String message, int status) {
        super(message);
        this.status = status;
    }

    public WorkflowException(String message) {
        this(message, 400);
    }

    public int status() {
        return status;
    }
}
