import { describe, it, expect } from "vitest";
import { normaliseHost, parseDomains } from "../src/lib/lenders";

describe("lender hosts", () => {
  it("normalises a host", () => {
    expect(normaliseHost("Loans.Example.COM")).toBe("loans.example.com");
    expect(normaliseHost("loans.example.com:8787")).toBe("loans.example.com");
    expect(normaliseHost("loans.example.com.")).toBe("loans.example.com");
    expect(normaliseHost("beta.localhost")).toBe("beta.localhost");
  });
  it("rejects what is not a host name", () => {
    for (const bad of ["", "has space.com", "a_b.com", "-x.com", "x..com", "http://x.com", "x.com/path", "*.example.com"]) expect(normaliseHost(bad)).toBeNull();
  });
  it("reads the stored list, ignoring bad entries and bad JSON", () => {
    expect(parseDomains('["A.example.com","b.example.com:80","not valid"]')).toEqual(["a.example.com", "b.example.com"]);
    expect(parseDomains("nonsense")).toEqual([]);
    expect(parseDomains('{"a":1}')).toEqual([]);
    expect(parseDomains(null)).toEqual([]);
  });
});

import { allowedAtAddress } from "../src/lib/lenders";

describe("which address an account may be used at", () => {
  const own = new Set([2]); // lender 2 has its own address; lender 1 has none
  it("a lender with its own address works only there", () => {
    expect(allowedAtAddress(2, 2, own)).toBe(true);
    expect(allowedAtAddress(2, null, own)).toBe(false);
    expect(allowedAtAddress(2, 3, own)).toBe(false);
  });
  it("a lender without one works on a shared address, not on another lender's", () => {
    expect(allowedAtAddress(1, null, own)).toBe(true);
    expect(allowedAtAddress(1, 1, own)).toBe(true);
    expect(allowedAtAddress(1, 2, own)).toBe(false);
  });
  it("a platform account works only on a shared address", () => {
    expect(allowedAtAddress(null, null, own)).toBe(true);
    expect(allowedAtAddress(null, 2, own)).toBe(false);
  });
});
