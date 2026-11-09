package com.digibank.auth.access;

/** Case-visibility rule of a role: all cases, the user's org unit and everything beneath it, or the unit alone. */
public enum Scope {
    ALL, UNIT_TREE, UNIT_ONLY;

    public static boolean isValid(String value) {
        for (Scope s : values()) if (s.name().equals(value)) return true;
        return false;
    }
}
