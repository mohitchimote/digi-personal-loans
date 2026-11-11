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

    private final com.digibank.application.security.CaseAccess caseAccess;

    public BusinessFinancialsController(BusinessFinancialsAnalysisService businessFinancialsAnalysisService,
                                        com.digibank.application.security.CaseAccess caseAccess) {
        this.businessFinancialsAnalysisService = businessFinancialsAnalysisService;
        this.caseAccess = caseAccess;
    }

    @GetMapping("/{appRef}/business-financials-analysis")
    public ResponseEntity<BusinessFinancialsAnalysis> getBusinessFinancialsAnalysis(@PathVariable String appRef) {
        caseAccess.visible(appRef);
        return ResponseEntity.ok(businessFinancialsAnalysisService.getOrGenerate(appRef));
    }
}
