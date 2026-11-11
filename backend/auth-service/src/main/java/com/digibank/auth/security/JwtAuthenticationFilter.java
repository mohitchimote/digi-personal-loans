package com.digibank.auth.security;

import com.digibank.auth.access.RoleConfigService;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserDetailsService userDetailsService;
    private final UserRepository userRepository;
    private final RoleConfigService roleConfig;

    /** Authority prefix for an entitlement: "case.actAsCustomer" becomes the authority "PERM_case.actAsCustomer". */
    public static final String PERMISSION_PREFIX = "PERM_";

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider, UserDetailsService userDetailsService,
                                    UserRepository userRepository, RoleConfigService roleConfig) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.userDetailsService = userDetailsService;
        this.userRepository = userRepository;
        this.roleConfig = roleConfig;
    }

    /** ROLE_x plus a PERM_x for each entitlement the person's role holds right now (read live, like the rest of
     * this filter, so an edited role applies at once), which is how the Worker gates by entitlement. */
    List<GrantedAuthority> authoritiesFor(User user, UserDetails details) {
        List<GrantedAuthority> out = new ArrayList<>(details.getAuthorities());
        if (user != null) {
            for (String e : roleConfig.resolve(user.getRole()).entitlements()) {
                out.add(new SimpleGrantedAuthority(PERMISSION_PREFIX + e));
            }
        }
        return out;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        final String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String jwt = authHeader.substring(7);
        try {
            final String uuid = jwtTokenProvider.getUsernameFromToken(jwt);
            if (uuid != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                UserDetails userDetails = userDetailsService.loadUserByUsername(uuid);
                // S2 (ARCHITECTURE_REVIEW_GAPS.md) — validateToken only checked username+expiry; it
                // never actually enforced the disabled/locked flags buildUserDetails() already
                // computes from the live row, so a disabled account's already-issued token stayed
                // usable here until natural expiry. Also rejects any token issued before this
                // user's sessionsRevokedAt (role change, disable, or logout-everywhere).
                User user = userRepository.findByUuid(uuid).orElse(null);
                boolean revoked = user != null && user.getSessionsRevokedAt() != null
                        && jwtTokenProvider.getIssuedAtFromToken(jwt)
                                .isBefore(user.getSessionsRevokedAt().atZone(ZoneId.systemDefault()).toInstant());
                if (jwtTokenProvider.validateToken(jwt, userDetails) && userDetails.isEnabled()
                        && userDetails.isAccountNonLocked() && !revoked) {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(userDetails, null, authoritiesFor(user, userDetails));
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }
            }
        } catch (Exception ignored) {
            // Invalid token — proceed without authentication
        }

        filterChain.doFilter(request, response);
    }
}
