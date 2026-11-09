package com.digibank.auth.access;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Organisation admin API. ADMIN-only (SecurityConfig covers /api/auth/admin/**). Same paths and JSON as the Worker. */
@RestController
@RequestMapping("/api/auth/admin/org")
public class OrgAdminController {

    private final OrgAdminService service;

    public OrgAdminController(OrgAdminService service) {
        this.service = service;
    }

    @GetMapping
    public OrgOverview overview() {
        return service.overview();
    }

    @PostMapping("/levels")
    public ResponseEntity<OrgLevel> createLevel(@Valid @RequestBody LevelRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createLevel(body, AdminActor.current()));
    }

    @PutMapping("/levels/{id}")
    public OrgLevel updateLevel(@PathVariable long id, @Valid @RequestBody LevelRequest body) {
        return service.updateLevel(id, body, AdminActor.current());
    }

    @DeleteMapping("/levels/{id}")
    public ResponseEntity<Void> deleteLevel(@PathVariable long id) {
        service.deleteLevel(id, AdminActor.current());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/units")
    public ResponseEntity<OrgUnit> createUnit(@Valid @RequestBody UnitRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createUnit(body, AdminActor.current()));
    }

    @PutMapping("/units/{id}")
    public OrgUnit updateUnit(@PathVariable long id, @Valid @RequestBody UnitRequest body) {
        return service.updateUnit(id, body, AdminActor.current());
    }

    @DeleteMapping("/units/{id}")
    public ResponseEntity<Void> deleteUnit(@PathVariable long id) {
        service.deleteUnit(id, AdminActor.current());
        return ResponseEntity.noContent().build();
    }
}
