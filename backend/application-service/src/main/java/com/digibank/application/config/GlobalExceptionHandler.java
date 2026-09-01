package com.digibank.application.config;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * This service had no exception handling at all before this — every IllegalArgumentException it
 * already throws for business-rule violations ("Application not found", "Unknown section", etc.)
 * fell through to Spring Boot's default error handler. Turning off include-message/
 * include-binding-errors globally (PRODUCTION_READINESS.md §5 finding 5, closing an info-leak) had
 * a side effect: those legitimate validation messages stopped reaching the frontend too, since
 * there was no controlled channel for them. This restores that channel properly instead of via a
 * global always/never flag — mirrors auth-service's ApiResponse / the Worker's AppError shape.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        // HashMap, not Map.of() — Map.of() throws NPE on a null value, and "data" is always null here.
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", ex.getMessage());
        body.put("data", null);
        return ResponseEntity.badRequest().body(body);
    }
}
