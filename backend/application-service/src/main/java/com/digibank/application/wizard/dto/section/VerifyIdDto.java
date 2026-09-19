package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class VerifyIdDto {

    @NotNull(message = "idVerified is required")
    @AssertTrue(message = "idVerified must be true")
    private Boolean idVerified;

    @NotNull(message = "files is required")
    private List<String> files;

    public Boolean getIdVerified() { return idVerified; }
    public void setIdVerified(Boolean idVerified) { this.idVerified = idVerified; }
    public List<String> getFiles() { return files; }
    public void setFiles(List<String> files) { this.files = files; }
}
