package com.digibank.auth.access;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UnitRequest(
        @NotBlank @Size(max = 32) String code,
        @NotBlank String name,
        @NotNull Long levelId,
        Long parentId,
        Boolean active) {}
