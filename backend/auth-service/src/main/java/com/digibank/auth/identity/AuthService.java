package com.digibank.auth.identity;

import com.digibank.auth.identity.dto.AuthResponse;
import com.digibank.auth.identity.dto.LoginOtpInitiatedResponse;
import com.digibank.auth.identity.dto.RegisterInitiatedResponse;
import com.digibank.auth.identity.dto.RegisterRequest;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import com.digibank.auth.security.JwtTokenProvider;
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
    private final JwtTokenProvider jwtTokenProvider;
    private final OtpService otpService;

    public AuthService(UserRepository userRepository, JwtTokenProvider jwtTokenProvider, OtpService otpService) {
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.otpService = otpService;
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
        user.setLastLogin(LocalDateTime.now());
        user = userRepository.save(user);

        return buildAuthResponse(user);
    }

    @Override
    public UserDetails loadUserByUsername(String uuid) throws UsernameNotFoundException {
        User user = userRepository.findByUuid(uuid)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + uuid));
        return buildUserDetails(user);
    }

    private AuthResponse buildAuthResponse(User user) {
        UserDetails userDetails = buildUserDetails(user);
        // Every other service validates this token without a database of its own (see
        // ARCHITECTURE.md/PRODUCTION_READINESS.md) — role/userId/fullName must travel inside the
        // token itself rather than being re-resolved via a lookup only auth-service can do.
        // fullName lets a service attribute a staff action (e.g. an approval) to who actually
        // holds the token, instead of trusting a free-text "reviewedBy" field the client supplies.
        // Map.of() would NPE if fullName is ever null (no NOT NULL constraint on that column) —
        // use a mutable map instead so a bare role/userId token is issued rather than login failing.
        Map<String, Object> extraClaims = new java.util.HashMap<>();
        extraClaims.put("role", user.getRole());
        extraClaims.put("userId", user.getId());
        extraClaims.put("fullName", user.getFullName());
        String token = jwtTokenProvider.generateToken(extraClaims, userDetails);

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
                .expiresIn(jwtTokenProvider.getExpirationTime())
                .companyName(user.getCompanyName())
                .build();
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
