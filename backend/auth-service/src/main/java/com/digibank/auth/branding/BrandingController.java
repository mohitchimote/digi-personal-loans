package com.digibank.auth.branding;

import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Branding context (ARCHITECTURE.md §10) — moved as-is from the top-level controller package.
 * Endpoint paths unchanged, including the mixed public/admin routing (GET is public, per
 * SecurityConfig; PUT/POST live under /api/auth/admin/branding, ADMIN-only).
 */
@RestController
public class BrandingController {

    // Q3 (ARCHITECTURE_REVIEW_GAPS.md) — matches worker/src/routes/branding.ts's ALLOWED_LOGO_TYPES
    // and MAX_LOGO_BYTES exactly. SVG is XML text, not binary magic bytes, but Tika's detector
    // chain handles it via XML root-element sniffing, same mechanism as its binary detection.
    private static final Set<String> ALLOWED_LOGO_TYPES = Set.of("image/png", "image/jpeg", "image/svg+xml");
    private static final long MAX_LOGO_BYTES = 5 * 1024 * 1024;

    private final Tika tika = new Tika();
    private final BrandingSettingsRepository repository;

    @Value("${app.branding.storage-path:./branding-store}")
    private String storagePath;

    public BrandingController(BrandingSettingsRepository repository) {
        this.repository = repository;
    }

    private BrandingSettings current() {
        return repository.findById(1L).orElseGet(() -> repository.save(new BrandingSettings()));
    }

    @GetMapping("/api/branding")
    public ResponseEntity<BrandingSettings> getBranding() {
        return ResponseEntity.ok(current());
    }

    @PutMapping("/api/auth/admin/branding")
    public ResponseEntity<BrandingSettings> updateBranding(@RequestBody Map<String, String> body) {
        BrandingSettings settings = current();
        if (body.get("primaryColor") != null) settings.setPrimaryColor(body.get("primaryColor"));
        // Q3 — previously silently dropped; worker/frontend already had this field end-to-end.
        if (body.get("secondaryColor") != null) settings.setSecondaryColor(body.get("secondaryColor"));
        if (body.get("accentColor") != null) settings.setAccentColor(body.get("accentColor"));
        // containsKey, not != null — an explicit `"gradientStart": null` in the body means "clear
        // it" (revert to the default derived gradient), same semantics as the worker's PUT handler.
        if (body.containsKey("gradientStart")) settings.setGradientStart(body.get("gradientStart"));
        if (body.containsKey("gradientEnd")) settings.setGradientEnd(body.get("gradientEnd"));
        return ResponseEntity.ok(repository.save(settings));
    }

    @PostMapping("/api/auth/admin/branding/logo")
    public ResponseEntity<?> uploadLogo(@RequestParam("file") MultipartFile file) throws IOException {
        byte[] bytes = file.getBytes();
        if (bytes.length > MAX_LOGO_BYTES) {
            throw new IllegalArgumentException("Logo is too large. Maximum size is 5MB.");
        }
        String detectedType = tika.detect(bytes);
        if (!ALLOWED_LOGO_TYPES.contains(detectedType)) {
            throw new IllegalArgumentException("Logo must be a PNG, JPEG, or SVG image.");
        }

        Path dir = Paths.get(storagePath);
        Files.createDirectories(dir);
        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Files.write(dir.resolve(filename), bytes);

        BrandingSettings settings = current();
        settings.setLogoUrl("/api/branding/logo/" + filename);
        return ResponseEntity.ok(repository.save(settings));
    }

    @GetMapping("/api/branding/logo/{filename}")
    public ResponseEntity<FileSystemResource> getLogo(@PathVariable String filename) {
        Path path = Paths.get(storagePath, filename);
        if (!Files.exists(path)) return ResponseEntity.notFound().build();
        MediaType mediaType = filename.toLowerCase().endsWith(".png") ? MediaType.IMAGE_PNG
                : filename.toLowerCase().endsWith(".svg") ? MediaType.valueOf("image/svg+xml")
                : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok().contentType(mediaType).body(new FileSystemResource(path));
    }
}
