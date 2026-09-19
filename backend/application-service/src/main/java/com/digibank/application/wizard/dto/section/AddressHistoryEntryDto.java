package com.digibank.application.wizard.dto.section;

import jakarta.validation.constraints.NotBlank;

public class AddressHistoryEntryDto {

    @NotBlank(message = "street is required")
    private String street;

    @NotBlank(message = "city is required")
    private String city;

    @NotBlank(message = "postCode is required")
    private String postCode;

    @NotBlank(message = "country is required")
    private String country;

    private Integer monthsAtAddress;

    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getPostCode() { return postCode; }
    public void setPostCode(String postCode) { this.postCode = postCode; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public Integer getMonthsAtAddress() { return monthsAtAddress; }
    public void setMonthsAtAddress(Integer monthsAtAddress) { this.monthsAtAddress = monthsAtAddress; }
}
