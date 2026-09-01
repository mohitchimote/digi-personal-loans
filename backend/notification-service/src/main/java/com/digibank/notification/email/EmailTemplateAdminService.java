package com.digibank.notification.email;

import com.digibank.notification.email.dto.EmailEventMeta;
import com.digibank.notification.email.dto.EmailTemplateDraft;
import com.digibank.notification.email.dto.EmailTemplateResponse;
import com.digibank.notification.email.dto.UpsertEmailTemplateRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Email-templates admin context (ARCHITECTURE.md §10) — ports worker/src/routes/
 * admin-email-templates.ts exactly (5 endpoints, ADMIN-only, see SecurityConfig).
 */
@Service
public class EmailTemplateAdminService {

    private final EmailTemplateRepository repository;
    private final EmailRenderer renderer;
    private final BrandingClient brandingClient;
    private final ResendClient resendClient;

    public EmailTemplateAdminService(EmailTemplateRepository repository, EmailRenderer renderer,
                                      BrandingClient brandingClient, ResendClient resendClient) {
        this.repository = repository;
        this.renderer = renderer;
        this.brandingClient = brandingClient;
        this.resendClient = resendClient;
    }

    public List<EmailEventMeta> getEvents() {
        return EventRegistry.EVENT_KEYS.stream().map(EventRegistry.EVENT_REGISTRY::get).toList();
    }

    public List<EmailTemplateResponse> getAllTemplates() {
        return EventRegistry.EVENT_KEYS.stream()
                .map(key -> EmailTemplateResponse.of(getOrSeedTemplate(key), EventRegistry.EVENT_REGISTRY.get(key)))
                .toList();
    }

    @Transactional
    public EmailTemplateResponse updateTemplate(String eventKey, UpsertEmailTemplateRequest body, String actingUserEmail) {
        requireKnownEvent(eventKey);
        EmailTemplate template = getOrSeedTemplate(eventKey);
        template.setEnabled(body.isEnabled());
        template.setToAddress(body.getToAddress());
        template.setCcAddress(body.getCcAddress());
        template.setSubject(body.getSubject());
        template.setHeaderContent(body.getHeaderContent());
        template.setBodyContent(body.getBodyContent());
        template.setSignature(body.getSignature());
        template.setFooter(body.getFooter());
        template.setUpdatedAt(Instant.now().toString());
        template.setUpdatedBy(actingUserEmail);
        EmailTemplate saved = repository.save(template);
        return EmailTemplateResponse.of(saved, EventRegistry.EVENT_REGISTRY.get(eventKey));
    }

    public String preview(String eventKey, EmailTemplateDraft draft) {
        requireKnownEvent(eventKey);
        TemplateFields fields = resolveDraftFields(getOrSeedTemplate(eventKey), draft);
        BrandingInfo branding = brandingClient.getBranding();
        return renderer.render(branding, fields, EventRegistry.SAMPLE_VARIABLES).html();
    }

    // Unlike the production sendTemplatedEmail path (EmailDeliveryService), a test send with no
    // feedback is useless to the admin — surface Resend's error directly rather than swallowing it.
    public DeliverResult sendTest(String eventKey, EmailTemplateDraft draft, String actingUserEmail) {
        requireKnownEvent(eventKey);
        EmailTemplate existing = getOrSeedTemplate(eventKey);
        TemplateFields fields = resolveDraftFields(existing, draft);
        String ccSource = draft.getCcAddress() != null ? draft.getCcAddress() : existing.getCcAddress();

        BrandingInfo branding = brandingClient.getBranding();
        RenderedEmail rendered = renderer.render(branding, fields, EventRegistry.SAMPLE_VARIABLES);
        return resendClient.deliver(actingUserEmail, renderer.splitAddresses(ccSource), rendered.subject(), rendered.html(), rendered.text());
    }

    private TemplateFields resolveDraftFields(EmailTemplate existing, EmailTemplateDraft draft) {
        return new TemplateFields(
                draft.getSubject() != null ? draft.getSubject() : existing.getSubject(),
                draft.getHeaderContent() != null ? draft.getHeaderContent() : existing.getHeaderContent(),
                draft.getBodyContent() != null ? draft.getBodyContent() : existing.getBodyContent(),
                draft.getSignature() != null ? draft.getSignature() : existing.getSignature(),
                draft.getFooter() != null ? draft.getFooter() : existing.getFooter());
    }

    private EmailTemplate getOrSeedTemplate(String eventKey) {
        return repository.findByEventKey(eventKey).orElseGet(() -> {
            EmailTemplate template = new EmailTemplate();
            template.setEventKey(eventKey);
            return repository.save(template);
        });
    }

    private void requireKnownEvent(String eventKey) {
        if (!EventRegistry.isKnownEventKey(eventKey)) {
            throw new IllegalArgumentException("Unknown event: " + eventKey);
        }
    }
}
