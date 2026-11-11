package com.digibank.document.config;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.bind.MissingServletRequestParameterException;

import java.util.HashMap;
import java.util.Map;

/**
 * Without this, an uncaught IllegalArgumentException (e.g. PathSafety's invalid-applicationRef
 * check, storage.StorageService.storeUpload()) falls through to Spring's default /error dispatch —
 * an internal forward that doesn't carry the original Authorization header, so it re-enters the
 * security filter chain unauthenticated and comes back as a misleading 401 "Token is invalid or
 * expired" instead of the real 400 validation error. Found while runtime-verifying the repackaging
 * (2026-08-28) — pre-existing since the path-traversal fix, not introduced by the repackage itself.
 * Same shape as application-service's GlobalExceptionHandler, and as the Worker's onError
 * ({ success:false, message, data:null } with the AppError's status).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    public static final String TOO_LARGE = "File is too large. Maximum size is 5MB.";

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

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleTooLarge(MaxUploadSizeExceededException ex) {
        return body(413, TOO_LARGE);
    }

    /** The Worker answers a missing "file" field with "A file is required."; other missing fields are read as empty/NaN there. */
    @ExceptionHandler({MissingServletRequestPartException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<Map<String, Object>> handleMissing(Exception ex) {
        String name = ex instanceof MissingServletRequestPartException p ? p.getRequestPartName()
                : ((MissingServletRequestParameterException) ex).getParameterName();
        return body(400, "file".equals(name) ? "A file is required." : "Missing required field: " + name);
    }
}
