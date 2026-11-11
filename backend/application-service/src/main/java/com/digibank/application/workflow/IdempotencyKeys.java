package com.digibank.application.workflow;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The client's Idempotency-Key for the request being served, if it sent one. A client that retries after a lost
 * response should reuse the key: the retry then cannot run the action twice (see WorkflowActions). Read only by the
 * entry points that serve a user request, never by the nested system actions they trigger.
 */
public final class IdempotencyKeys {

    public static final String HEADER = "Idempotency-Key";
    static final int MAX = 100;

    private IdempotencyKeys() {}

    public static String current() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (!(attrs instanceof ServletRequestAttributes s)) return null;
        HttpServletRequest request = s.getRequest();
        String key = request.getHeader(HEADER);
        if (key == null || key.isBlank()) return null;
        key = key.trim();
        return key.length() > MAX ? key.substring(0, MAX) : key;
    }
}
