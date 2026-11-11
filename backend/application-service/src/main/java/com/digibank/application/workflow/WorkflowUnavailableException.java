package com.digibank.application.workflow;

import com.digibank.application.config.ApiException;

/**
 * workflow-service could not answer (down, timed out, or itself failed). The user's action fails with 503 and
 * nothing is applied: the Worker's equivalent is its own "A service this action depends on is unavailable"
 * answer when the engine cannot get a fact it needs.
 */
public class WorkflowUnavailableException extends ApiException {

    public static final String MESSAGE = "A service this action depends on is unavailable. Try again shortly.";

    public WorkflowUnavailableException(Throwable cause) {
        super(503, MESSAGE);
        if (cause != null) initCause(cause);
    }
}
