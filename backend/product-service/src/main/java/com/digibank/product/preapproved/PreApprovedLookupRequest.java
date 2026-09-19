package com.digibank.product.preapproved;

import jakarta.validation.constraints.NotBlank;

/**
 * POST-wrapper body for the pre-approved-offer lookup (2026-09-09 architecture review,
 * "POST-Based Integration" — GET is discouraged for banking calls; a customer's national ID
 * shouldn't sit in a browser-facing GET URL). Replaces the old {@code GET .../{nationalId}}.
 */
public class PreApprovedLookupRequest {

    @NotBlank(message = "nationalId is required")
    private String nationalId;

    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }
}
