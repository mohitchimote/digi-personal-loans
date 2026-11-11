package com.digibank.rule.config;

import com.digibank.rule.directory.DirectoryUnavailableException;
import com.digibank.rule.mandates.MandateApiException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/** Refusals in the Worker's {success, message, data} shape. Handled here rather than left to Boot's /error
 * forward, which would re-enter the security chain unauthenticated and surface as a misleading 401. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static ResponseEntity<Map<String, Object>> refusal(int status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("data", null);
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler(MandateApiException.class)
    public ResponseEntity<Map<String, Object>> mandate(MandateApiException e) {
        return refusal(e.getStatus(), e.getMessage());
    }

    @ExceptionHandler(DirectoryUnavailableException.class)
    public ResponseEntity<Map<String, Object>> directory(DirectoryUnavailableException e) {
        return refusal(503, "The organisation directory is unavailable, so this cannot be decided right now. Try again shortly.");
    }
}
