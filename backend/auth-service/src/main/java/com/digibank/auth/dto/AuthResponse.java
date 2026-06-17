package com.digibank.auth.dto;

public class AuthResponse {
    private String token;
    private String tokenType = "Bearer";
    private Long userId;
    private String email;
    private String fullName;
    private String role;
    private long expiresIn;

    public AuthResponse() {}

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getTokenType() { return tokenType; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public long getExpiresIn() { return expiresIn; }
    public void setExpiresIn(long expiresIn) { this.expiresIn = expiresIn; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final AuthResponse r = new AuthResponse();
        public Builder token(String v) { r.token = v; return this; }
        public Builder tokenType(String v) { r.tokenType = v; return this; }
        public Builder userId(Long v) { r.userId = v; return this; }
        public Builder email(String v) { r.email = v; return this; }
        public Builder fullName(String v) { r.fullName = v; return this; }
        public Builder role(String v) { r.role = v; return this; }
        public Builder expiresIn(long v) { r.expiresIn = v; return this; }
        public AuthResponse build() { return r; }
    }
}
