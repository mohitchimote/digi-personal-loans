package com.digibank.document.security;

import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Mirrors application-service's CurrentUser. Safe on any route behind requireAuth: the
 * security filter chain guarantees an AuthenticatedUser principal is present before a
 * controller method is ever invoked there.
 */
public final class CurrentUser {
    private CurrentUser() {}

    public static AuthenticatedUser get() {
        return (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
