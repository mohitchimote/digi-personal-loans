import { describe, it, expect } from "vitest";
import { refersToRule, usesImage } from "../src/lib/letters/service";
import { sniffImage } from "../src/lib/letters/image";

const doc = (rule: unknown, extra: unknown[] = []) => JSON.stringify({ formatVersion: 1, header: [], body: [{ id: "b", t: "when", rule, children: extra }], footer: [] });

describe("is a saved rule used", () => {
  it("finds a reference wherever it sits, whatever the key order", () => {
    expect(refersToRule(doc({ t: "ref", id: "low_income" }), "low_income")).toBe(true);
    expect(refersToRule(doc({ id: "low_income", t: "ref" }), "low_income")).toBe(true);
    expect(refersToRule(doc({ t: "all", of: [{ t: "any", of: [{ t: "ref", id: "deep" }] }] }), "deep")).toBe(true);
  });
  it("does not confuse ids that differ in a character LIKE treats as a wildcard", () => {
    expect(refersToRule(doc({ t: "ref", id: "aXb" }), "a_b")).toBe(false);
    expect(refersToRule(doc({ t: "ref", id: "a1" }), "a%")).toBe(false);
  });
  it("is not fooled by the id appearing as ordinary text", () => {
    expect(refersToRule(doc({ t: "field", path: "loan.amount" }, [{ id: "x", t: "para", text: { en: "rule low_income", he: "" } }]), "low_income")).toBe(false);
  });
  it("treats unreadable JSON as possibly used, so a delete is refused rather than risked", () => {
    expect(refersToRule("not json {low_income", "low_income")).toBe(true);
    expect(refersToRule("not json", "low_income")).toBe(false);
  });
});

describe("is a picture used", () => {
  it("finds it in header, body, footer and inside blocks", () => {
    const d = JSON.stringify({ header: [{ t: "image", imageId: "img-1" }], body: [{ t: "when", children: [{ t: "signature", imageId: "img-2" }] }], footer: [] });
    expect(usesImage(d, "img-1")).toBe(true);
    expect(usesImage(d, "img-2")).toBe(true);
    expect(usesImage(d, "img-3")).toBe(false);
  });
  it("matches whole ids only", () => {
    expect(usesImage(JSON.stringify({ body: [{ imageId: "img-10" }] }), "img-1")).toBe(false);
  });
});

describe("picture header sniffing", () => {
  const png = (w: number, h: number) => { const b = new Uint8Array(32); b.set([0x89, 0x50, 0x4e, 0x47], 0); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
  it("reads a PNG's size", () => expect(sniffImage(png(300, 120))).toEqual({ mimeType: "image/png", width: 300, height: 120 }));
  const jpegWith = (prefix: number[]) => Uint8Array.from([0xff, 0xd8, 0xff, ...prefix, 0xff, 0xc0, 0, 17, 8, 0x00, 0x78, 0x01, 0x2c, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("reads a JPEG's size", () => expect(sniffImage(jpegWith([]))).toEqual({ mimeType: "image/jpeg", width: 300, height: 120 }));
  it("steps over markers that have no length field instead of reading a size from them", () => {
    expect(sniffImage(jpegWith([0xff, 0xd0, 0xff, 0x01]))).toEqual({ mimeType: "image/jpeg", width: 300, height: 120 });
  });
  it("rejects anything that is neither", () => expect(sniffImage(new Uint8Array(40))).toBeNull());
});
