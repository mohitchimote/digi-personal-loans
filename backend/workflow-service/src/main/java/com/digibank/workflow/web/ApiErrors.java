package com.digibank.workflow.web;

import com.digibank.workflow.client.Directory.UpstreamUnavailableException;
import com.digibank.workflow.service.WorkflowException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * Error bodies in the Worker's shape, {success:false, message, data:null}, so the one Angular client
 * reads them the same whichever backend answered.
 */
@RestControllerAdvice
public class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    static ResponseEntity<Map<String, Object>> body(int status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("data", null);
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler(WorkflowException.class)
    public ResponseEntity<Map<String, Object>> workflow(WorkflowException e) {
        return body(e.status(), e.getMessage());
    }

    @ExceptionHandler(UpstreamUnavailableException.class)
    public ResponseEntity<Map<String, Object>> upstream(UpstreamUnavailableException e) {
        log.warn("Upstream unavailable: {}", e.getMessage());
        return body(HttpStatus.SERVICE_UNAVAILABLE.value(), "A service this action depends on is unavailable. Try again shortly.");
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, Object>> badRequest(Exception e) {
        return body(400, e instanceof IllegalArgumentException ? e.getMessage() : "Invalid request body.");
    }
}
