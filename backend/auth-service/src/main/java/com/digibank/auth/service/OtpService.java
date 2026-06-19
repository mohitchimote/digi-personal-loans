package com.digibank.auth.service;

import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
public class OtpService {

    private static final int OTP_VALIDITY_MINUTES = 5;
    private static final int MAX_ATTEMPTS = 5;
    private final SecureRandom random = new SecureRandom();

    private final UserRepository userRepository;

    public OtpService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public String generateAndAssign(User user) {
        String code = String.format("%06d", random.nextInt(1_000_000));
        user.setOtpCode(code);
        user.setOtpExpiresAt(LocalDateTime.now().plusMinutes(OTP_VALIDITY_MINUTES));
        user.setOtpAttempts(0);
        userRepository.save(user);
        return code;
    }

    public long validitySeconds() {
        return OTP_VALIDITY_MINUTES * 60L;
    }

    public User verify(String email, String otp) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("No registration found for this email."));

        if (user.isEmailVerified()) {
            throw new IllegalArgumentException("This account is already verified.");
        }
        if (user.getOtpCode() == null || user.getOtpExpiresAt() == null) {
            throw new IllegalArgumentException("No active OTP. Please request a new code.");
        }
        if (LocalDateTime.now().isAfter(user.getOtpExpiresAt())) {
            throw new IllegalArgumentException("This OTP has expired. Please request a new code.");
        }
        if (user.getOtpAttempts() >= MAX_ATTEMPTS) {
            throw new IllegalArgumentException("Too many incorrect attempts. Please request a new code.");
        }
        if (!user.getOtpCode().equals(otp)) {
            user.setOtpAttempts(user.getOtpAttempts() + 1);
            userRepository.save(user);
            throw new IllegalArgumentException("Incorrect OTP code.");
        }

        user.setEmailVerified(true);
        user.setEnabled(true);
        user.setOtpCode(null);
        user.setOtpExpiresAt(null);
        user.setOtpAttempts(0);
        return userRepository.save(user);
    }
}
