package com.digibank.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public class ApplicationSectionRequest {

    @NotBlank(message = "Section name is required")
    private String section;

    @NotNull(message = "Section data is required")
    private Map<String, Object> data;

    @NotNull(message = "Customer ID is required")
    private Long customerId;

    private String customerEmail;

    public String getSection() { return section; }
    public void setSection(String section) { this.section = section; }

    public Map<String, Object> getData() { return data; }
    public void setData(Map<String, Object> data) { this.data = data; }

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }
}
