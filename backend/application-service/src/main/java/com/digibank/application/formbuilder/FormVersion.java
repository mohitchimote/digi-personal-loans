package com.digibank.application.formbuilder;

import jakarta.persistence.*;

/**
 * One version of one form (personal-loan-wizard or business-loan-wizard): the form_versions table of
 * the Worker. Timestamps are ISO-8601 strings, as the Worker stores and serves them, so the admin
 * screens see the same JSON from either backend. Status is DRAFT, PUBLISHED or ARCHIVED.
 */
@Entity
@Table(name = "form_versions", uniqueConstraints = @UniqueConstraint(columnNames = {"formKey", "version"}))
public class FormVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String formKey;

    @Column(nullable = false)
    private Integer version;

    @Column(nullable = false)
    private String status = "DRAFT";

    @Column(nullable = false, columnDefinition = "MEDIUMTEXT")
    private String schemaJson;

    @Column(columnDefinition = "TEXT")
    private String changeNote;

    @Column(nullable = false)
    private String createdAt;

    private String createdBy;
    private String publishedAt;
    private String publishedBy;

    public FormVersion() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getSchemaJson() { return schemaJson; }
    public void setSchemaJson(String schemaJson) { this.schemaJson = schemaJson; }
    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String changeNote) { this.changeNote = changeNote; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getPublishedAt() { return publishedAt; }
    public void setPublishedAt(String publishedAt) { this.publishedAt = publishedAt; }
    public String getPublishedBy() { return publishedBy; }
    public void setPublishedBy(String publishedBy) { this.publishedBy = publishedBy; }
}
