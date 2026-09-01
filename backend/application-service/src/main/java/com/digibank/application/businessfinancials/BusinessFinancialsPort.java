package com.digibank.application.businessfinancials;

import com.digibank.application.businessfinancials.dto.BusinessFinancialsAnalysis;
import com.digibank.application.model.LoanApplication;

/**
 * The integration seam this context exists around — same pattern as
 * dataverification.DataVerificationPort (see its Javadoc, and PRODUCTION_READINESS.md §7). Today's
 * only implementation (SimulatedBusinessFinancialsAdapter) fabricates the P&L/cashflow/ratios
 * since no real credit-bureau/core-banking feed exists; a real integration becomes a second
 * implementation of this interface, with BusinessFinancialsAnalysisService unchanged.
 */
public interface BusinessFinancialsPort {
    BusinessFinancialsAnalysis generate(LoanApplication app);
}
