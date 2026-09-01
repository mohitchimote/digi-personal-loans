package com.digibank.notification.email;

/** Only the two fields email rendering needs out of auth-service's full BrandingSettings. */
public record BrandingInfo(String primaryColor, String logoUrl) {
}
