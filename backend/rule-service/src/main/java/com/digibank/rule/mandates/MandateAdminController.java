package com.digibank.rule.mandates;

import com.digibank.rule.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

/**
 * The mandates admin API at the Worker's paths, so the Admin Mandates page works unchanged. ADMIN-only for
 * reading and writing alike, as the Worker has it (SecurityConfig). The gateway routes this path here.
 */
@RestController
@RequestMapping("/api/auth/admin/mandates")
public class MandateAdminController {

    private final MandateAdminService service;

    public MandateAdminController(MandateAdminService service) {
        this.service = service;
    }

    private static MandateAdminService.Actor actor() {
        Object p = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (p instanceof AuthenticatedUser u) return new MandateAdminService.Actor(u.displayName(), u.role());
        return new MandateAdminService.Actor(String.valueOf(p), null);
    }

    @GetMapping
    public MandateAdminService.Overview list() {
        return service.overview();
    }

    @PostMapping
    public ResponseEntity<Mandate> create(@RequestBody MandateRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(body, actor()));
    }

    @PutMapping("/{id}")
    public Mandate update(@PathVariable long id, @RequestBody MandateRequest body) {
        return service.update(id, body, actor());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        service.delete(id, actor());
        return ResponseEntity.noContent().build();
    }
}
