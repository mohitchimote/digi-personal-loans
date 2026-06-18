package com.digibank.auth.controller;

import com.digibank.auth.model.BrandingSettings;
import com.digibank.auth.repository.BrandingSettingsRepository;
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
import java.util.UUID;

@RestController
public class BrandingController {

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
        if (body.get("accentColor") != null) settings.setAccentColor(body.get("accentColor"));
        return ResponseEntity.ok(repository.save(settings));
    }

    @PostMapping("/api/auth/admin/branding/logo")
    public ResponseEntity<BrandingSettings> uploadLogo(@RequestParam("file") MultipartFile file) throws IOException {
        Path dir = Paths.get(storagePath);
        Files.createDirectories(dir);
        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Files.write(dir.resolve(filename), file.getBytes());

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
