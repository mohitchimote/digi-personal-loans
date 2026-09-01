package com.digibank.notification.security;

import org.springframework.security.core.context.SecurityContextHolder;

/** Mirrors application-service's CurrentUser (PRODUCTION_READINESS.md §5). */
public final class CurrentUser {
    private CurrentUser() {}

    public static AuthenticatedUser get() {
        return (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
