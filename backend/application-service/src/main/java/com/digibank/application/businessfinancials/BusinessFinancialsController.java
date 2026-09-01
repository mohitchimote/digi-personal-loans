package com.digibank.application.businessfinancials;

import com.digibank.application.businessfinancials.dto.BusinessFinancialsAnalysis;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Business-financials-intelligence context (ARCHITECTURE.md §10) — split out of the old
 * ApplicationController. Endpoint path unchanged.
 */
@RestController
@RequestMapping("/api/applications")
public class BusinessFinancialsController {

    private final BusinessFinancialsAnalysisService businessFinancialsAnalysisService;

    public BusinessFinancialsController(BusinessFinancialsAnalysisService businessFinancialsAnalysisService) {
        this.businessFinancialsAnalysisService = businessFinancialsAnalysisService;
    }

    @GetMapping("/{appRef}/business-financials-analysis")
    public ResponseEntity<BusinessFinancialsAnalysis> getBusinessFinancialsAnalysis(@PathVariable String appRef) {
        return ResponseEntity.ok(businessFinancialsAnalysisService.getOrGenerate(appRef));
    }
}
