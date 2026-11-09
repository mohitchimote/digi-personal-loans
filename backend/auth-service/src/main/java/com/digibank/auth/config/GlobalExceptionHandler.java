package com.digibank.auth.config;

import com.digibank.auth.access.AdminApiException;
import com.digibank.auth.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.badRequest().body(ApiResponse.error(message));
    }

    // Added for Q3's branding-logo validation (ARCHITECTURE_REVIEW_GAPS.md) — without this, an
    // uncaught IllegalArgumentException falls through to Spring's default /error forward, which
    // doesn't carry the original Authorization header and re-enters the security filter chain
    // unauthenticated, surfacing as a misleading 401 instead of 400 (same bug class already fixed
    // in application-service's/document-service's/notification-service's own handlers).
    // Admin refusals carry their own status (400 unless the rule says 403/404), in the same
    // {success, message, data} shape the Worker answers with.
    @ExceptionHandler(AdminApiException.class)
    public ResponseEntity<ApiResponse<Void>> handleAdmin(AdminApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error(ex.getMessage()));
    }
}
