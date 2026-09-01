package com.digibank.auth.identity;

import com.digibank.auth.dto.ApiResponse;
import com.digibank.auth.identity.dto.AuthResponse;
import com.digibank.auth.identity.dto.CustomerProfileResponse;
import com.digibank.auth.identity.dto.LoginOtpInitiatedResponse;
import com.digibank.auth.identity.dto.LoginOtpRequest;
import com.digibank.auth.identity.dto.LoginVerifyRequest;
import com.digibank.auth.identity.dto.OtpResendRequest;
import com.digibank.auth.identity.dto.OtpVerifyRequest;
import com.digibank.auth.identity.dto.RegisterInitiatedResponse;
import com.digibank.auth.identity.dto.RegisterRequest;
import com.digibank.auth.repository.UserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * Identity & auth context (ARCHITECTURE.md §10) — split out of the old AuthController, which also
 * carried the public FAQ read (moved to faqs.FaqController). Endpoint paths unchanged.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;

    public AuthController(AuthService authService, UserRepository userRepository) {
        this.authService = authService;
        this.userRepository = userRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<RegisterInitiatedResponse>> register(@Valid @RequestBody RegisterRequest request) {
        try {
            RegisterInitiatedResponse response = authService.register(request);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.success("Almost there — please verify your email to finish creating your account.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/register-by-staff")
    public ResponseEntity<ApiResponse<AuthResponse>> registerByStaff(@Valid @RequestBody RegisterRequest request) {
        try {
            AuthResponse response = authService.registerByStaff(request);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.success("Customer account created.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/register/verify-otp")
    public ResponseEntity<ApiResponse<AuthResponse>> verifyOtp(@Valid @RequestBody OtpVerifyRequest request) {
        try {
            AuthResponse response = authService.verifyRegistrationOtp(request.getEmail(), request.getOtp());
            return ResponseEntity.ok(ApiResponse.success("Registration successful. Welcome to DigiBank.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/register/resend-otp")
    public ResponseEntity<ApiResponse<RegisterInitiatedResponse>> resendOtp(@Valid @RequestBody OtpResendRequest request) {
        try {
            RegisterInitiatedResponse response = authService.resendOtp(request.getEmail());
            return ResponseEntity.ok(ApiResponse.success("A new OTP has been generated.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/login/request-otp")
    public ResponseEntity<ApiResponse<LoginOtpInitiatedResponse>> requestLoginOtp(@Valid @RequestBody LoginOtpRequest request) {
        try {
            LoginOtpInitiatedResponse response = authService.requestLoginOtp(request.getNationalId());
            return ResponseEntity.ok(ApiResponse.success("A login code has been generated.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/login/verify-otp")
    public ResponseEntity<ApiResponse<AuthResponse>> verifyLoginOtp(@Valid @RequestBody LoginVerifyRequest request) {
        try {
            AuthResponse response = authService.verifyLoginOtp(request.getNationalId(), request.getOtp());
            return ResponseEntity.ok(ApiResponse.success("Login successful.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    /** Lets a Banker assisting a customer's application prefill wizard sections with data the
     * customer already gave at account creation (name/phone/National ID/issue date) — never the
     * Banker's own identity. See EffectiveIdentityService on the frontend. */
    @GetMapping("/customer-profile/{id}")
    public ResponseEntity<ApiResponse<CustomerProfileResponse>> getCustomerProfile(@PathVariable Long id) {
        return userRepository.findById(id)
                .map(u -> ResponseEntity.ok(ApiResponse.success("OK", CustomerProfileResponse.from(u))))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.<CustomerProfileResponse>error("Customer not found.")));
    }

    @GetMapping("/validate")
    public ResponseEntity<ApiResponse<String>> validate(@AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("Token is invalid or expired."));
        }
        return ResponseEntity.ok(ApiResponse.success("Token is valid.", userDetails.getUsername()));
    }
}
