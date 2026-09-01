package com.digibank.notification.email;

/** ok=true: error is null. ok=false: error explains why (never thrown, mirroring the Worker's
 * deliverEmail — see ResendClient). */
public record DeliverResult(boolean ok, String error) {
    public static DeliverResult success() { return new DeliverResult(true, null); }
    public static DeliverResult failure(String error) { return new DeliverResult(false, error); }
}
