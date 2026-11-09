package com.digibank.auth.access;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record LevelRequest(@NotBlank String name, @Min(1) int depth) {}
