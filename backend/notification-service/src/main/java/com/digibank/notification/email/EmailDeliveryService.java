package com.digibank.notification.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The production, fire-and-forget entry point application-service calls after a lifecycle event —
 * ports worker/src/lib/email.ts's sendTemplatedEmail exactly: best-effort, never throws, mirroring
 * NotificationClient/sendNotification's "never block the business action" convention.
 */
@Service
public class EmailDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(EmailDeliveryService.class);

    private final EmailTemplateRepository repository;
    private final EmailRenderer renderer;
    private final BrandingClient brandingClient;
    private final ResendClient resendClient;

    public EmailDeliveryService(EmailTemplateRepository repository, EmailRenderer renderer,
                                 BrandingClient brandingClient, ResendClient resendClient) {
        this.repository = repository;
        this.renderer = renderer;
        this.brandingClient = brandingClient;
        this.resendClient = resendClient;
    }

    public void sendTemplatedEmail(String eventKey, String customerEmail, java.util.Map<String, String> variables) {
        try {
            EmailTemplate template = repository.findByEventKey(eventKey).orElse(null);
            if (template == null || !template.isEnabled()) return;

            String to = (template.getToAddress() != null && !template.getToAddress().isBlank())
                    ? template.getToAddress().trim() : customerEmail;
            if (to == null || to.isBlank()) return;

            TemplateFields fields = new TemplateFields(template.getSubject(), template.getHeaderContent(),
                    template.getBodyContent(), template.getSignature(), template.getFooter());
            BrandingInfo branding = brandingClient.getBranding();
            RenderedEmail rendered = renderer.render(branding, fields, variables);

            DeliverResult result = resendClient.deliver(to, renderer.splitAddresses(template.getCcAddress()),
                    rendered.subject(), rendered.html(), rendered.text());
            if (!result.ok()) {
                log.error("sendTemplatedEmail: {} send failed: {}", eventKey, result.error());
            }
        } catch (Exception e) {
            log.error("sendTemplatedEmail failed for {} (non-fatal)", eventKey, e);
        }
    }
}
