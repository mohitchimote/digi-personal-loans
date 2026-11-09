package com.digibank.auth.access;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RoleCreateRequest(
        @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,31}$", message = "Code must be 2-32 chars: A-Z, 0-9, underscore.") String code,
        @NotBlank @Size(max = 80) String label,
        @Size(max = 300) String description,
        @NotBlank String scope,
        @Min(0) @Max(100) Integer escalationRank,
        @NotNull List<String> entitlements) {

    RoleRequest body() {
        return new RoleRequest(label, description, scope, escalationRank, entitlements);
    }
}
