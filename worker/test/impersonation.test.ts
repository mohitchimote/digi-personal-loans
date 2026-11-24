import { describe, it, expect } from "vitest";
import { mayViewAs, isReadMethod } from "../src/lib/impersonation";

const user = (id: number, role: string, lenderId: number | null, enabled = true) => ({ id, role, lenderId, enabled });
const admin1 = user(1, "ADMIN", 1);
const uw1 = user(2, "UNDERWRITER", 1);

describe("viewing as another user", () => {
  it("lets a lender admin view one of their own lender's users", () => {
    expect(mayViewAs(admin1, uw1, 1)).toEqual({ ok: true });
  });
  it("refuses a user of another lender, as if they did not exist", () => {
    expect(mayViewAs(admin1, user(3, "CUSTOMER", 2), 1)).toEqual({ ok: false, reason: "User not found." });
  });
  it("refuses administrators and platform admins, and yourself", () => {
    expect(mayViewAs(admin1, user(4, "ADMIN", 1), 1).ok).toBe(false);
    expect(mayViewAs(admin1, user(5, "SUPER_ADMIN", null), 1).ok).toBe(false);
    expect(mayViewAs(admin1, admin1, 1).ok).toBe(false);
  });
  it("refuses a disabled user or a disabled administrator", () => {
    expect(mayViewAs(admin1, user(6, "CUSTOMER", 1, false), 1).ok).toBe(false);
    expect(mayViewAs(user(1, "ADMIN", 1, false), uw1, 1).ok).toBe(false);
  });
  it("refuses anyone who is not an administrator", () => {
    expect(mayViewAs(user(7, "UNDERWRITER", 1), user(8, "CUSTOMER", 1), 1).ok).toBe(false);
    expect(mayViewAs(user(9, "SENIOR_UNDERWRITER", 1), uw1, 1).ok).toBe(false);
  });
  it("lets a platform admin view a user only of the lender it is inside", () => {
    const sa = user(10, "SUPER_ADMIN", null);
    expect(mayViewAs(sa, uw1, 1).ok).toBe(true);
    expect(mayViewAs(sa, uw1, 2).ok).toBe(false);
    expect(mayViewAs(sa, uw1, null).ok).toBe(false);
  });
  it("a lender admin cannot use a token claiming another lender", () => {
    expect(mayViewAs(admin1, user(3, "CUSTOMER", 2), 2).ok).toBe(false);
  });
  it("only reads are allowed in such a session", () => {
    expect(isReadMethod("GET")).toBe(true);
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(isReadMethod(m)).toBe(false);
  });
});
