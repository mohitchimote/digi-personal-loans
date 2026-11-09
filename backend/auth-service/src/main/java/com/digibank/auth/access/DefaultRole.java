package com.digibank.auth.access;

import java.util.List;

/** A role as seeded on first start. {@code rank} is its place on the escalation ladder (null = not on it). */
public record DefaultRole(String code, String label, Scope scope, Integer rank, boolean locked, List<String> entitlements) {}
