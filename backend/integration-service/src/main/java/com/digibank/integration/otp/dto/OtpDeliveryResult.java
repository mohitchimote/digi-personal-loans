package com.digibank.integration.otp.dto;

public class OtpDeliveryResult {

    private boolean delivered;
    private String provider;
    private String messageId;

    public boolean isDelivered() { return delivered; }
    public void setDelivered(boolean delivered) { this.delivered = delivered; }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
}
