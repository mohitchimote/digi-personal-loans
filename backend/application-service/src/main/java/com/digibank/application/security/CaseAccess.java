package com.digibank.application.security;

import com.digibank.application.config.ApiException;
import com.digibank.application.model.LoanApplication;
import com.digibank.application.org.OrgScope;
import com.digibank.application.repository.LoanApplicationRepository;
import org.springframework.stereotype.Component;

/**
 * Who may touch a case. Two rules, both from the Worker:
 * <ul>
 *   <li>acting as the customer (submit, withdraw, cancel, select a product, save a section): the
 *   owning customer, or staff holding case.actAsCustomer (the workflow's OWNER_OR_ASSISTING guard,
 *   403 "You can only act on your own applications.");</li>
 *   <li>seeing a case: staff within their org scope (assertCaseVisible, 404 so existence is not
 *   confirmed); a customer only their own case.</li>
 * </ul>
 */
@Component
public class CaseAccess {

    public static final String ACT_AS_CUSTOMER = "case.actAsCustomer";

    private final LoanApplicationRepository repository;
    private final OrgScope orgScope;

    public CaseAccess(LoanApplicationRepository repository, OrgScope orgScope) {
        this.repository = repository;
        this.orgScope = orgScope;
    }

    public LoanApplication find(String appRef) {
        return repository.findByApplicationRef(appRef)
                .orElseThrow(() -> new IllegalArgumentException("Application not found: " + appRef));
    }

    public static boolean isOwner(AuthenticatedUser user, LoanApplication app) {
        return user.userId() != null && user.userId().equals(app.getCustomerId());
    }

    /** Owner, or staff who may assist customers; else 403. */
    public void assertCanActAsCustomer(LoanApplication app) {
        AuthenticatedUser user = CurrentUser.get();
        boolean ok = isOwner(user, app) || (user.isStaff() && user.has(ACT_AS_CUSTOMER));
        if (!ok) throw new ApiException(403, "You can only act on your own applications.");
    }

    public boolean isVisible(AuthenticatedUser user, LoanApplication app) {
        return user.isStaff() ? orgScope.isVisible(user, app.getOrgUnitId()) : isOwner(user, app);
    }

    public void assertVisible(LoanApplication app) {
        if (!isVisible(CurrentUser.get(), app)) throw new ApiException(404, "Application not found.");
    }

    public LoanApplication visible(String appRef) {
        LoanApplication app = find(appRef);
        assertVisible(app);
        return app;
    }

    public LoanApplication actingAsCustomer(String appRef) {
        LoanApplication app = find(appRef);
        assertCanActAsCustomer(app);
        return app;
    }

    /** Listing a customer's applications, or starting one for them: the customer themselves, or any staff. */
    public static void assertOwnsCustomerId(Long customerId) {
        AuthenticatedUser user = CurrentUser.get();
        if (user.isStaff()) return;
        if (user.userId() == null || !user.userId().equals(customerId)) throw new ApiException(403, "Forbidden.");
    }
}
