package com.digibank.application.dto;

import jakarta.validation.constraints.NotNull;

public class StartApplicationRequest {
    @NotNull
    private Long customerId;
    private String customerEmail;

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }
}
