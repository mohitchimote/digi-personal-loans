package com.digibank.auth.controller;

import com.digibank.auth.dto.ApiResponse;
import com.digibank.auth.dto.UserSummaryResponse;
import com.digibank.auth.model.Faq;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.FaqRepository;
import com.digibank.auth.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/admin")
public class AdminController {

    private final UserRepository userRepository;
    private final FaqRepository faqRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminController(UserRepository userRepository, FaqRepository faqRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.faqRepository = faqRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping("/users")
    public ResponseEntity<List<UserSummaryResponse>> getUsers() {
        return ResponseEntity.ok(userRepository.findAll().stream().map(UserSummaryResponse::from).toList());
    }

    @PutMapping("/users/{id}/role")
    public ResponseEntity<ApiResponse<UserSummaryResponse>> updateRole(@PathVariable Long id, @RequestBody Map<String, String> body) {
        User user = userRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("User not found: " + id));
        user.setRole(body.get("role"));
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.success("Role updated.", UserSummaryResponse.from(user)));
    }

    @PutMapping("/users/{id}/enabled")
    public ResponseEntity<ApiResponse<UserSummaryResponse>> setEnabled(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        User user = userRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("User not found: " + id));
        user.setEnabled(Boolean.TRUE.equals(body.get("enabled")));
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.success("User updated.", UserSummaryResponse.from(user)));
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<ApiResponse<String>> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        User user = userRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("User not found: " + id));
        String newPassword = body.get("newPassword");
        if (newPassword == null || newPassword.length() < 6) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Password must be at least 6 characters."));
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.success("Password reset.", null));
    }

    @GetMapping("/faqs")
    public ResponseEntity<List<Faq>> getFaqs() {
        return ResponseEntity.ok(faqRepository.findAllByOrderByCategoryAscDisplayOrderAsc());
    }

    @PostMapping("/faqs")
    public ResponseEntity<Faq> createFaq(@RequestBody Faq faq) {
        faq.setId(null);
        return ResponseEntity.status(HttpStatus.CREATED).body(faqRepository.save(faq));
    }

    @PutMapping("/faqs/{id}")
    public ResponseEntity<Faq> updateFaq(@PathVariable Long id, @RequestBody Faq update) {
        Faq faq = faqRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("FAQ not found: " + id));
        faq.setCategory(update.getCategory());
        faq.setQuestion(update.getQuestion());
        faq.setAnswer(update.getAnswer());
        faq.setVideoId(update.getVideoId());
        faq.setDisplayOrder(update.getDisplayOrder());
        return ResponseEntity.ok(faqRepository.save(faq));
    }

    @DeleteMapping("/faqs/{id}")
    public ResponseEntity<Void> deleteFaq(@PathVariable Long id) {
        faqRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
