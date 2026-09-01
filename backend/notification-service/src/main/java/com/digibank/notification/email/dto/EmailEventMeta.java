package com.digibank.notification.email.dto;

import java.util.List;

public record EmailEventMeta(String eventKey, String label, String description, List<EmailVariable> variables) {
}
