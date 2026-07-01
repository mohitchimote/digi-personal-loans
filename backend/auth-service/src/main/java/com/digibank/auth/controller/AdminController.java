package com.digibank.auth.controller;

import com.digibank.auth.dto.ApiResponse;
import com.digibank.auth.dto.CreateStaffRequest;
import com.digibank.auth.dto.UserSummaryResponse;
import com.digibank.auth.model.Faq;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.FaqRepository;
import com.digibank.auth.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/admin")
public class AdminController {

    private final UserRepository userRepository;
    private final FaqRepository faqRepository;

    public AdminController(UserRepository userRepository, FaqRepository faqRepository) {
        this.userRepository = userRepository;
        this.faqRepository = faqRepository;
    }

    private static final List<String> STAFF_ROLES = Arrays.asList(
            "BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN");
    private static final List<String> CUSTOMER_ROLES = Arrays.asList("CUSTOMER", "BUSINESS_OWNER");

    @GetMapping("/users")
    public ResponseEntity<List<UserSummaryResponse>> getUsers(
            @RequestParam(required = false) String type) {
        List<User> users;
        if ("staff".equals(type)) {
            users = userRepository.findByRoleIn(STAFF_ROLES);
        } else if ("customers".equals(type)) {
            users = userRepository.findByRoleIn(CUSTOMER_ROLES);
        } else {
            users = userRepository.findAll();
        }
        return ResponseEntity.ok(users.stream().map(UserSummaryResponse::from).toList());
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

    @PostMapping("/users")
    public ResponseEntity<?> createStaffUser(@RequestBody CreateStaffRequest req) {
        if (userRepository.existsByEmail(req.getEmail())) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Email already in use."));
        }
        if (userRepository.existsByNationalId(req.getNationalId())) {
            return ResponseEntity.badRequest().body(ApiResponse.error("National ID already in use."));
        }
        if (!STAFF_ROLES.contains(req.getRole())) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Invalid staff role."));
        }
        User user = new User();
        user.setEmail(req.getEmail());
        user.setFullName(req.getFullName());
        user.setNationalId(req.getNationalId());
        user.setPhoneNumber(req.getPhoneNumber());
        user.setRole(req.getRole());
        user.setEnabled(true);
        user.setEmailVerified(true);
        userRepository.save(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Staff user created.", UserSummaryResponse.from(user)));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        User user = userRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("User not found: " + id));
        if (!CUSTOMER_ROLES.contains(user.getRole())) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Only customer records can be deleted."));
        }
        userRepository.deleteById(id);
        return ResponseEntity.noContent().build();
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
