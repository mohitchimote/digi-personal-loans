package com.digibank.auth.identity;

import com.digibank.auth.identity.dto.AuthResponse;
import com.digibank.auth.identity.dto.LoginOtpInitiatedResponse;
import com.digibank.auth.identity.dto.RegisterInitiatedResponse;
import com.digibank.auth.identity.dto.RegisterRequest;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Identity & auth context (ARCHITECTURE.md §10) — registration, National ID + OTP login, JWT
 * issuance. Every other service depends on this one issuing correct tokens (they validate
 * statelessly, see JwtTokenProvider/PRODUCTION_READINESS.md §5) — keep this context's reliability
 * a priority independent of anything else in auth-service.
 */
@Service
public class AuthService implements UserDetailsService {

    private final UserRepository userRepository;
    private final OtpService otpService;
    private final AuthResponseFactory authResponses;

    public AuthService(UserRepository userRepository, OtpService otpService, AuthResponseFactory authResponses) {
        this.userRepository = userRepository;
        this.otpService = otpService;
        this.authResponses = authResponses;
    }

    @Transactional
    public RegisterInitiatedResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("An account with this email address already exists.");
        }
        if (userRepository.existsByNationalId(request.getNationalId())) {
            throw new IllegalArgumentException("An account with this National ID already exists.");
        }

        boolean isBusiness = "BUSINESS".equals(request.getAccountType());
        if (isBusiness) {
            if (request.getCompanyName() == null || request.getCompanyName().isBlank()) {
                throw new IllegalArgumentException("Company name is required for a business account.");
            }
            if (request.getCompanyRegistrationNumber() == null || request.getCompanyRegistrationNumber().isBlank()) {
                throw new IllegalArgumentException("Company registration number is required for a business account.");
            }
        }

        User.Builder builder = User.builder()
                .email(request.getEmail())
                .nationalId(request.getNationalId())
                .idIssueDate(request.getIdIssueDate())
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .role(isBusiness ? "BUSINESS_OWNER" : "CUSTOMER")
                .enabled(false)
                .emailVerified(false);

        if (isBusiness) {
            builder.companyName(request.getCompanyName())
                    .companyRegistrationNumber(request.getCompanyRegistrationNumber())
                    .companyIndustry(request.getCompanyIndustry())
                    .companyFoundedYear(request.getCompanyFoundedYear());
        }

        User user = builder.build();

        User saved = userRepository.save(user);
        String otp = otpService.generateAndAssign(saved);

        return RegisterInitiatedResponse.builder()
                .email(saved.getEmail())
                .demoOtp(otp)
                .otpExpiresInSeconds(otpService.validitySeconds())
                .build();
    }

    /** Banker-assisted registration: a Banker has already verified the customer's identity in
     * person or by phone, so the account is created enabled/verified straight away — no
     * email-OTP round trip like the customer self-service register() above. */
    @Transactional
    public AuthResponse registerByStaff(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("An account with this email address already exists.");
        }
        if (userRepository.existsByNationalId(request.getNationalId())) {
            throw new IllegalArgumentException("An account with this National ID already exists.");
        }

        boolean isBusiness = "BUSINESS".equals(request.getAccountType());
        if (isBusiness) {
            if (request.getCompanyName() == null || request.getCompanyName().isBlank()) {
                throw new IllegalArgumentException("Company name is required for a business account.");
            }
            if (request.getCompanyRegistrationNumber() == null || request.getCompanyRegistrationNumber().isBlank()) {
                throw new IllegalArgumentException("Company registration number is required for a business account.");
            }
        }

        User.Builder builder = User.builder()
                .email(request.getEmail())
                .nationalId(request.getNationalId())
                .idIssueDate(request.getIdIssueDate())
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .role(isBusiness ? "BUSINESS_OWNER" : "CUSTOMER")
                .enabled(true)
                .emailVerified(true);

        if (isBusiness) {
            builder.companyName(request.getCompanyName())
                    .companyRegistrationNumber(request.getCompanyRegistrationNumber())
                    .companyIndustry(request.getCompanyIndustry())
                    .companyFoundedYear(request.getCompanyFoundedYear());
        }

        User saved = userRepository.save(builder.build());
        return buildAuthResponse(saved);
    }

    @Transactional
    public AuthResponse verifyRegistrationOtp(String email, String otp) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("No registration found for this email."));
        if (user.isEmailVerified()) {
            throw new IllegalArgumentException("This account is already verified.");
        }

        user = otpService.verifyOtp(user, otp);
        user.setEmailVerified(true);
        user.setEnabled(true);
        user.setLastLogin(LocalDateTime.now());
        user = userRepository.save(user);

        return buildAuthResponse(user);
    }

    @Transactional
    public RegisterInitiatedResponse resendOtp(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("No registration found for this email."));
        if (user.isEmailVerified()) {
            throw new IllegalArgumentException("This account is already verified.");
        }
        String otp = otpService.generateAndAssign(user);
        return RegisterInitiatedResponse.builder()
                .email(user.getEmail())
                .demoOtp(otp)
                .otpExpiresInSeconds(otpService.validitySeconds())
                .build();
    }

    @Transactional
    public LoginOtpInitiatedResponse requestLoginOtp(String nationalId) {
        User user = userRepository.findByNationalId(nationalId)
                .orElseThrow(() -> new IllegalArgumentException("No account found for this National ID."));
        if (!user.isEnabled()) {
            throw new IllegalArgumentException("This account is disabled. Please contact DigiBank support.");
        }
        String otp = otpService.generateAndAssign(user);
        return LoginOtpInitiatedResponse.builder()
                .nationalId(user.getNationalId())
                .demoOtp(otp)
                .otpExpiresInSeconds(otpService.validitySeconds())
                .build();
    }

    @Transactional
    public AuthResponse verifyLoginOtp(String nationalId, String otp) {
        User user = userRepository.findByNationalId(nationalId)
                .orElseThrow(() -> new IllegalArgumentException("No account found for this National ID."));
        if (!user.isEnabled()) {
            throw new IllegalArgumentException("This account is disabled. Please contact DigiBank support.");
        }

        user = otpService.verifyOtp(user, otp);
        // Captured before this login overwrites it: the staff header shows "last accessed ...".
        LocalDateTime previousLogin = user.getLastLogin();
        user.setLastLogin(LocalDateTime.now());
        user = userRepository.save(user);

        AuthResponse response = buildAuthResponse(user);
        response.setPreviousLogin(previousLogin);
        return response;
    }

    @Override
    public UserDetails loadUserByUsername(String uuid) throws UsernameNotFoundException {
        User user = userRepository.findByUuid(uuid)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + uuid));
        return buildUserDetails(user);
    }

    private AuthResponse buildAuthResponse(User user) {
        // The token carries everything the other services decide on (role, entitlements, scope, org
        // unit, ladder rank): they validate it without a database of their own. See TokenClaims.
        return authResponses.build(user, buildUserDetails(user));
    }

    private UserDetails buildUserDetails(User user) {
        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getUuid())
                .password("N/A")
                .authorities(List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())))
                .accountExpired(false)
                .accountLocked(!user.isEnabled())
                .credentialsExpired(false)
                .disabled(!user.isEnabled())
                .build();
    }
}
