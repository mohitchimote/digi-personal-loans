package com.digibank.auth.access;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;

/** One entitlement held by one role. */
@Entity
@Table(name = "role_entitlements")
@IdClass(RoleEntitlement.Key.class)
public class RoleEntitlement {

    @Id
    private String roleCode;

    @Id
    private String entitlement;

    public RoleEntitlement() {}

    public RoleEntitlement(String roleCode, String entitlement) {
        this.roleCode = roleCode;
        this.entitlement = entitlement;
    }

    public String getRoleCode() { return roleCode; }
    public String getEntitlement() { return entitlement; }

    public static class Key implements Serializable {
        private String roleCode;
        private String entitlement;

        public Key() {}

        public static Key of(String roleCode, String entitlement) {
            Key k = new Key();
            k.roleCode = roleCode;
            k.entitlement = entitlement;
            return k;
        }

        @Override public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(roleCode, k.roleCode) && Objects.equals(entitlement, k.entitlement);
        }
        @Override public int hashCode() { return Objects.hash(roleCode, entitlement); }
    }
}
