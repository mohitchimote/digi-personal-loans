package com.digibank.integration.otp.dto;

public class OtpDeliveryRequest {

    private String destination;
    private String channel;
    private String code;

    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }

    public String getChannel() { return channel; }
    public void setChannel(String channel) { this.channel = channel; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
}
