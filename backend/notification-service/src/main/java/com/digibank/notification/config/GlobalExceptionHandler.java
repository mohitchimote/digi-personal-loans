package com.digibank.notification.config;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * Added alongside the email-templates admin endpoints, which throw IllegalArgumentException for
 * "Unknown event" — without this, an uncaught exception falls through to Spring's default /error
 * forward, which doesn't carry the original Authorization header and re-enters the security
 * filter chain unauthenticated, surfacing as a misleading 401 instead of 400 (the same bug class
 * found and fixed in document-service's GlobalExceptionHandler — PRODUCTION_READINESS.md §5).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", ex.getMessage());
        body.put("data", null);
        return ResponseEntity.badRequest().body(body);
    }
}
