package com.digibank.rule.mandates;

/** A refusal, answered as {"success":false,"message":...,"data":null} at the given status (400 unless stated),
 * which is what the Worker's AppError produces. */
public class MandateApiException extends RuntimeException {

    private final int status;

    public MandateApiException(String message) {
        this(message, 400);
    }

    public MandateApiException(String message, int status) {
        super(message);
        this.status = status;
    }

    public int getStatus() { return status; }
}
