package com.digibank.auth.identity;

import com.digibank.auth.access.RoleConfig;
import com.digibank.auth.access.RoleConfigService;
import com.digibank.auth.access.Scope;
import com.digibank.auth.identity.dto.AuthResponse;
import com.digibank.auth.model.User;
import com.digibank.auth.security.JwtTokenProvider;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Issues the token and the login response for a user. The response has the Worker's shape, including
 * roleLabel, entitlements and scope, which the screens use to decide what to show (the server still
 * enforces every permission itself).
 */
@Component
public class AuthResponseFactory {

    private final JwtTokenProvider jwt;
    private final RoleConfigService roles;

    public AuthResponseFactory(JwtTokenProvider jwt, RoleConfigService roles) {
        this.jwt = jwt;
        this.roles = roles;
    }

    public AuthResponse build(User user, UserDetails details) {
        RoleConfig role = roles.resolve(user.getRole());
        String token = jwt.generateToken(TokenClaims.forUser(user, role), details);
        return AuthResponse.builder()
                .token(token)
                .tokenType("Bearer")
                .userId(user.getId())
                .email(user.getEmail())
                .nationalId(user.getNationalId())
                .idIssueDate(user.getIdIssueDate())
                .fullName(user.getFullName())
                .phoneNumber(user.getPhoneNumber())
                .role(user.getRole())
                .roleLabel(role.isStaff() ? role.label() : null)
                .entitlements(role.isStaff() ? TokenClaims.inCatalogOrder(role) : List.of())
                .scope(role.isStaff() ? role.scope().name() : Scope.ALL.name())
                .expiresIn(jwt.getExpirationTime())
                .companyName(user.getCompanyName())
                .companyRegistrationNumber(user.getCompanyRegistrationNumber())
                .companyIndustry(user.getCompanyIndustry())
                .companyFoundedYear(user.getCompanyFoundedYear())
                .build();
    }
}
