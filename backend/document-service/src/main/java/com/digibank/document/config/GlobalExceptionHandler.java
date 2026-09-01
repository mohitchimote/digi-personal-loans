package com.digibank.document.config;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * Without this, an uncaught IllegalArgumentException (e.g. PathSafety's invalid-applicationRef
 * check, storage.StorageService.storeUpload()) falls through to Spring's default /error dispatch —
 * an internal forward that doesn't carry the original Authorization header, so it re-enters the
 * security filter chain unauthenticated and comes back as a misleading 401 "Token is invalid or
 * expired" instead of the real 400 validation error. Found while runtime-verifying the repackaging
 * (2026-08-28) — pre-existing since the path-traversal fix, not introduced by the repackage itself.
 * Same shape as application-service's GlobalExceptionHandler.
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
