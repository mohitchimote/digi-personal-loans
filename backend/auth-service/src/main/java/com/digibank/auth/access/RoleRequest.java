package com.digibank.auth.access;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** The editable parts of a role. {@code escalationRank} null means "not an approver". */
public record RoleRequest(
        @NotBlank @Size(max = 80) String label,
        @Size(max = 300) String description,
        @NotBlank String scope,
        @Min(0) @Max(100) Integer escalationRank,
        @NotNull List<String> entitlements) {}
