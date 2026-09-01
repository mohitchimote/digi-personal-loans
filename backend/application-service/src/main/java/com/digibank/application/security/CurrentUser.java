package com.digibank.application.security;

import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Shared by every controller that needs the caller's real identity (WizardController for
 * section-by-underwriter, DecisioningController, NotesController) instead of a client-supplied
 * "reviewedBy"/"editedBy" field (PRODUCTION_READINESS.md §5). Safe on any route behind
 * requireAuth: the security filter chain guarantees an AuthenticatedUser principal is present
 * before a controller method is ever invoked there.
 */
public final class CurrentUser {
    private CurrentUser() {}

    public static AuthenticatedUser get() {
        return (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
