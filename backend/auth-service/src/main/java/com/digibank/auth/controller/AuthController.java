package com.digibank.auth.controller;

import com.digibank.auth.dto.ApiResponse;
import com.digibank.auth.dto.AuthResponse;
import com.digibank.auth.dto.LoginRequest;
import com.digibank.auth.dto.RegisterRequest;
import com.digibank.auth.model.Faq;
import com.digibank.auth.repository.FaqRepository;
import com.digibank.auth.security.JwtTokenProvider;
import com.digibank.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtTokenProvider jwtTokenProvider;
    private final FaqRepository faqRepository;

    public AuthController(AuthService authService, JwtTokenProvider jwtTokenProvider, FaqRepository faqRepository) {
        this.authService = authService;
        this.jwtTokenProvider = jwtTokenProvider;
        this.faqRepository = faqRepository;
    }

    @GetMapping("/faqs")
    public ResponseEntity<List<Faq>> getFaqs() {
        return ResponseEntity.ok(faqRepository.findAllByOrderByCategoryAscDisplayOrderAsc());
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        try {
            AuthResponse response = authService.register(request);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.success("Registration successful. Welcome to DigiBank.", response));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        try {
            AuthResponse response = authService.login(request);
            return ResponseEntity.ok(ApiResponse.success("Login successful.", response));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("Invalid email or password."));
        }
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
