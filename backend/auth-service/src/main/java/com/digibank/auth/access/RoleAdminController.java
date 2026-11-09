package com.digibank.auth.access;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Roles and entitlements admin API. ADMIN-only (SecurityConfig covers /api/auth/admin/**). Same paths and JSON as the Worker. */
@RestController
@RequestMapping("/api/auth/admin/roles")
public class RoleAdminController {

    private final RoleAdminService service;

    public RoleAdminController(RoleAdminService service) {
        this.service = service;
    }

    @GetMapping
    public RoleList list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> create(@Valid @RequestBody RoleCreateRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("code", service.create(body, AdminActor.current())));
    }

    @PutMapping("/{code}")
    public Map<String, String> update(@PathVariable String code, @Valid @RequestBody RoleRequest body) {
        return Map.of("code", service.update(code, body, AdminActor.current()));
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@PathVariable String code) {
        service.delete(code, AdminActor.current());
        return ResponseEntity.noContent().build();
    }
}
