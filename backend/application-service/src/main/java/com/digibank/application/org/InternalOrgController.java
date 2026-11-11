package com.digibank.application.org;

import com.digibank.application.config.ApiException;
import com.digibank.application.repository.LoanApplicationRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Service-to-service: how many cases sit in an org unit. auth-service asks before deleting a unit
 * (the Worker refuses when cases remain). Like auth-service's revoked-since poll it carries no
 * credentials and no personal data (a number), so SecurityConfig lets it through unauthenticated; but
 * /api/applications/** is also what the gateway publishes, so a request that came through the gateway
 * (it adds X-Forwarded-Host) is refused: only a direct, in-cluster call is answered.
 */
@RestController
@RequestMapping("/api/applications/internal")
public class InternalOrgController {

    private final LoanApplicationRepository repository;

    public InternalOrgController(LoanApplicationRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/org-units/{id}/case-count")
    public Map<String, Object> caseCount(@PathVariable Long id, HttpServletRequest request) {
        if (request.getHeader("X-Forwarded-Host") != null || request.getHeader("Forwarded") != null) {
            throw new ApiException(403, "Forbidden.");
        }
        return Map.of("count", repository.countByOrgUnitId(id));
    }
}
