package com.digibank.application.wizard.dto.section;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public class SignatoriesDto {

    @NotEmpty(message = "signatories must contain at least one entry")
    private List<@Valid SignatoryDto> signatories;

    public List<SignatoryDto> getSignatories() { return signatories; }
    public void setSignatories(List<SignatoryDto> signatories) { this.signatories = signatories; }
}
