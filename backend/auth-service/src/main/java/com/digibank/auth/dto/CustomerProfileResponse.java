package com.digibank.auth.dto;

import com.digibank.auth.model.User;
import java.time.LocalDate;

/** Minimal profile lookup for a Banker assisting a customer's application — separate from
 * UserSummaryResponse (admin-only, includes account-management fields like enabled/role) since
 * this is purely for prefilling wizard sections with data the customer already gave at account
 * creation, never the Banker's own identity. */
public class CustomerProfileResponse {
    private Long id;
    private String email;
    private String nationalId;
    private LocalDate idIssueDate;
    private String fullName;
    private String phoneNumber;
    private String companyName;

    public static CustomerProfileResponse from(User u) {
        CustomerProfileResponse r = new CustomerProfileResponse();
        r.id = u.getId();
        r.email = u.getEmail();
        r.nationalId = u.getNationalId();
        r.idIssueDate = u.getIdIssueDate();
        r.fullName = u.getFullName();
        r.phoneNumber = u.getPhoneNumber();
        r.companyName = u.getCompanyName();
        return r;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getNationalId() { return nationalId; }
    public LocalDate getIdIssueDate() { return idIssueDate; }
    public String getFullName() { return fullName; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getCompanyName() { return companyName; }
}
