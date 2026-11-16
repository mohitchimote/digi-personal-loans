import { describe, it, expect } from "vitest";
import { decideLenderContext, filterLoginAccounts, type Lender } from "../src/lib/lenders";
import { signJwt, verifyJwt } from "../src/lib/jwt";

const active = { status: "ACTIVE" };
const lender = (id: number, code: string, status = "ACTIVE"): Lender => ({ id, code, name: code, status, createdAt: "now" });
const user = (role: string, lenderId: number | null) => ({ id: 1, role, lenderId }) as never;

describe("token lender context", () => {
  it("accepts a token whose lender matches the user's own lender", () => {
    expect(decideLenderContext({ lenderId: 2, role: "ADMIN" }, 2, active, false)).toEqual({ ok: true, lenderId: 2 });
  });
  it("rejects a token issued for a different lender than the user's row", () => {
    expect(decideLenderContext({ lenderId: 2, role: "ADMIN" }, 1, active, false)).toEqual({ ok: false });
  });
  it("rejects a platform-level token (0) on a lender user", () => {
    expect(decideLenderContext({ lenderId: 2, role: "ADMIN" }, 0, active, false)).toEqual({ ok: false });
  });
  it("rejects every token of a suspended lender", () => {
    expect(decideLenderContext({ lenderId: 2, role: "ADMIN" }, 2, { status: "SUSPENDED" }, false)).toEqual({ ok: false });
  });
  it("lets a super admin sit at platform level (0) or inside an existing lender", () => {
    expect(decideLenderContext({ lenderId: null, role: "SUPER_ADMIN" }, 0, null, false)).toEqual({ ok: true, lenderId: null });
    expect(decideLenderContext({ lenderId: null, role: "SUPER_ADMIN" }, 3, null, true)).toEqual({ ok: true, lenderId: 3 });
  });
  it("rejects a super admin token naming a lender that does not exist", () => {
    expect(decideLenderContext({ lenderId: null, role: "SUPER_ADMIN" }, 99, null, false)).toEqual({ ok: false });
  });
  it("rejects a lender-less row that is not a super admin", () => {
    expect(decideLenderContext({ lenderId: null, role: "ADMIN" }, 0, null, false)).toEqual({ ok: false });
    expect(decideLenderContext({ lenderId: null, role: "CUSTOMER" }, 5, null, true)).toEqual({ ok: false });
  });
});

describe("token claims", () => {
  it("round-trips the lender claim", async () => {
    const t = await signJwt("uuid-1", "secret", 7);
    expect((await verifyJwt(t, "secret")).lenderId).toBe(7);
  });
  it("rejects a token with no lender claim (issued before lenders existed)", async () => {
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode("secret");
    const old = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("u").setIssuedAt().setExpirationTime("1h").sign(key);
    await expect(verifyJwt(old, "secret")).rejects.toThrow();
  });
});

describe("login accounts for a national id", () => {
  const rows = [
    { user: user("CUSTOMER", 1), lender: lender(1, "DIGI") },
    { user: user("CUSTOMER", 2), lender: lender(2, "NORTH") },
    { user: user("CUSTOMER", 3), lender: lender(3, "OLD", "SUSPENDED") },
  ];
  it("lists every active lender's account when no code is given (the picker)", () => {
    expect(filterLoginAccounts(rows).map((a) => a.lender?.code)).toEqual(["DIGI", "NORTH"]);
  });
  it("narrows to one lender by code, ignoring case", () => {
    expect(filterLoginAccounts(rows, "north").map((a) => a.lender?.code)).toEqual(["NORTH"]);
  });
  it("never offers a suspended lender, even by code", () => {
    expect(filterLoginAccounts(rows, "OLD")).toEqual([]);
  });
  it("finds a platform account only when no code is given", () => {
    const sa = [{ user: user("SUPER_ADMIN", null), lender: null }];
    expect(filterLoginAccounts(sa)).toHaveLength(1);
    expect(filterLoginAccounts(sa, "DIGI")).toHaveLength(0);
  });
  it("ignores a lender-less account that is not a super admin", () => {
    expect(filterLoginAccounts([{ user: user("ADMIN", null), lender: null }])).toEqual([]);
  });
});
