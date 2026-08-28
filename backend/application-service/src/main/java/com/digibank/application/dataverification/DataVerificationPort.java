package com.digibank.application.dataverification;

import com.digibank.application.dataverification.dto.DataVerificationSummary;
import com.digibank.application.model.LoanApplication;

/**
 * The integration seam this context exists around: comparing the customer's self-declared data
 * against document/3rd-party data. Today's only implementation (SimulatedDataVerificationAdapter)
 * fabricates plausible discrepancies since no OCR/document-AI or credit-bureau/national-registry
 * integration exists yet (ARCHITECTURE.md §6.3, §9). When one does, it becomes a second
 * implementation of this same interface — DataVerificationService (the orchestrator that persists
 * results and handles staff resolution) doesn't change at all.
 *
 * This is the "integration-service" question raised in review, 2026-08-28: rather than standing up
 * a physical integration-service with nothing real to integrate with yet, each context that fakes
 * a third-party call gets a narrow port like this one, so a real adapter is a drop-in later, not a
 * rewrite. See PRODUCTION_READINESS.md §7.
 */
public interface DataVerificationPort {
    DataVerificationSummary generate(LoanApplication app);
}
