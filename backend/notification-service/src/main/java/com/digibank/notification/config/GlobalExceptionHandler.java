package com.digibank.notification.config;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * Same { success:false, message, data:null } body the Worker's onError returns. Without it, an
 * uncaught exception falls through to Spring's default /error forward, which doesn't carry the
 * original Authorization header and re-enters the security chain unauthenticated, surfacing as a
 * misleading 401 (the bug class fixed in document-service's handler, PRODUCTION_READINESS.md §5).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static ResponseEntity<Map<String, Object>> body(int status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("data", null);
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler(AppException.class)
    public ResponseEntity<Map<String, Object>> handleApp(AppException ex) {
        return body(ex.getStatus(), ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return body(400, ex.getMessage());
    }
}
