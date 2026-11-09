package com.digibank.auth.identity;

import com.digibank.auth.identity.dto.AuthResponse;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AuthServiceLoginTest {

    private final UserRepository users = mock(UserRepository.class);
    private final OtpService otp = mock(OtpService.class);
    private final AuthResponseFactory factory = mock(AuthResponseFactory.class);
    private final AuthService service = new AuthService(users, otp, factory);

    @Test
    void aLoginReportsWhenThePersonLastSignedInBeforeThisOne() {
        LocalDateTime earlier = LocalDateTime.now().minusDays(3);
        User user = User.builder().email("s@example.com").nationalId("000000131").fullName("Staff").role("UNDERWRITER").build();
        ReflectionTestUtils.setField(user, "uuid", "uuid-staff"); // assigned on first save in real life
        user.setLastLogin(earlier);
        when(users.findByNationalId("000000131")).thenReturn(Optional.of(user));
        when(otp.verifyOtp(any(), any())).thenReturn(user);
        when(users.save(any(User.class))).thenAnswer(i -> i.getArgument(0));
        when(factory.build(any(), any())).thenReturn(new AuthResponse());

        AuthResponse r = service.verifyLoginOtp("000000131", "123456");

        assertThat(r.getPreviousLogin()).isEqualTo(earlier);
        assertThat(user.getLastLogin()).isAfter(earlier); // and this login is now the latest
    }

    @Test
    void aFirstEverLoginHasNoPreviousLogin() {
        User user = User.builder().email("n@example.com").nationalId("000000132").fullName("New").role("CUSTOMER").build();
        ReflectionTestUtils.setField(user, "uuid", "uuid-new");
        when(users.findByNationalId("000000132")).thenReturn(Optional.of(user));
        when(otp.verifyOtp(any(), any())).thenReturn(user);
        when(users.save(any(User.class))).thenAnswer(i -> i.getArgument(0));
        when(factory.build(any(), any())).thenReturn(new AuthResponse());

        assertThat(service.verifyLoginOtp("000000132", "123456").getPreviousLogin()).isNull();
    }

    @Test
    void aDisabledAccountCannotLogIn() {
        User user = User.builder().email("d@example.com").nationalId("000000133").role("CUSTOMER").build();
        user.setEnabled(false);
        when(users.findByNationalId("000000133")).thenReturn(Optional.of(user));
        assertThatThrownBy(() -> service.verifyLoginOtp("000000133", "123456"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("disabled");
        verify(factory, never()).build(any(), any());
    }
}
