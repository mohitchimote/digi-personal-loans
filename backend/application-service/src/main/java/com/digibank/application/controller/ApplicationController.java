package com.digibank.application.controller;

import com.digibank.application.dto.ApplicationSectionRequest;
import com.digibank.application.dto.StartApplicationRequest;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.service.ApplicationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/applications")
public class ApplicationController {

    private final ApplicationService applicationService;

    public ApplicationController(ApplicationService applicationService) {
        this.applicationService = applicationService;
    }

    @PostMapping("/start")
    public ResponseEntity<LoanApplication> startApplication(@Valid @RequestBody StartApplicationRequest request) {
        return ResponseEntity.ok(
                applicationService.createOrResumeApplication(request.getCustomerId(), request.getCustomerEmail()));
    }

    @PutMapping("/{appRef}/section")
    public ResponseEntity<LoanApplication> saveSection(
            @PathVariable String appRef,
            @Valid @RequestBody ApplicationSectionRequest request) {
        return ResponseEntity.ok(
                applicationService.saveSection(appRef, request.getSection(), request.getData()));
    }

    @GetMapping("/{appRef}")
    public ResponseEntity<LoanApplication> getApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.getApplication(appRef));
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<LoanApplication>> getCustomerApplications(@PathVariable Long customerId) {
        return ResponseEntity.ok(applicationService.getApplicationsByCustomer(customerId));
    }

    @PostMapping("/{appRef}/submit")
    public ResponseEntity<LoanApplication> submitApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.submitApplication(appRef));
    }

    @PostMapping("/{appRef}/select-product")
    public ResponseEntity<LoanApplication> selectProduct(
            @PathVariable String appRef,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(applicationService.selectProduct(appRef, body));
    }

    @PostMapping("/{appRef}/approve")
    public ResponseEntity<LoanApplication> approveApplication(@PathVariable String appRef) {
        return ResponseEntity.ok(applicationService.approveApplication(appRef));
    }
}
