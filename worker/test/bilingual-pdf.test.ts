import { describe, it, expect } from "vitest";
import type { PDFFont } from "pdf-lib";
import { embeddedRuns, visualOrder, forEmbeddedFont, wrapLines, drawable } from "../src/lib/pdf/bilingual";

// A stand-in font: every character is 1 unit wide and "supports" Latin, Hebrew, digits and common signs.
const fakeFont = {
  widthOfTextAtSize: (t: string, size: number) => t.length * size,
  getCharacterSet: () => [..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:()%₪".split(""), ..."אבגדהוזחטיכלמנסעפצקרשת"].map((c) => c.codePointAt(0)!),
} as unknown as PDFFont;

describe("visualOrder", () => {
  it("leaves English untouched", () => {
    expect(visualOrder("Amount of the loan: 150,000", "ltr")).toBe("Amount of the loan: 150,000");
  });
  it("reverses Hebrew into drawing order", () => {
    expect(visualOrder("שלום", "rtl")).toBe("םולש");
  });
  it("keeps numbers and Latin words in their own direction inside Hebrew", () => {
    // logical: הכנסה 21,500 ₪   -> number stays 21,500 and sits left of the Hebrew word
    expect(visualOrder("הכנסה 21,500", "rtl")).toBe("21,500 הסנכה");
    expect(visualOrder("בנק ABC בע", "rtl")).toBe("עב ABC קנב");
  });
  it("mirrors brackets so they face the text they enclose", () => {
    expect(visualOrder("(שלום)", "rtl")).toBe("(םולש)");
  });
  it("does not mirror brackets in English", () => {
    expect(visualOrder("(hello)", "ltr")).toBe("(hello)");
  });
  it("handles an empty line", () => {
    expect(visualOrder("", "rtl")).toBe("");
  });
});

describe("forEmbeddedFont", () => {
  it("pre-reverses when the first letter with a script is Hebrew, because the font library will reverse again", () => {
    expect(forEmbeddedFont("םולש")).toBe("שלום");
    expect(forEmbeddedFont("21,500 הסנכה")).toBe([..."21,500 הסנכה"].reverse().join(""));
  });
  it("skips signs and digits that have no script of their own", () => {
    expect(forEmbeddedFont("₪ 150 םולש")).toBe([..."₪ 150 םולש"].reverse().join(""));
  });
  it("leaves lines that start with Latin letters alone", () => {
    expect(forEmbeddedFont("ABC םולש")).toBe("ABC םולש");
  });
  it("leaves digit-only and empty lines alone", () => {
    expect(forEmbeddedFont("2,858")).toBe("2,858");
    expect(forEmbeddedFont("")).toBe("");
  });
});

describe("wrapLines and drawable", () => {
  it("wraps at word boundaries within the width", () => {
    expect(wrapLines("one two three four", fakeFont, 1, 9)).toEqual(["one two", "three", "four"]);
  });
  it("keeps explicit line breaks", () => {
    expect(wrapLines("a b\nc", fakeFont, 1, 50)).toEqual(["a b", "c"]);
  });
  it("does not split a long word", () => {
    expect(wrapLines("abcdefghijkl x", fakeFont, 1, 5)).toEqual(["abcdefghijkl", "x"]);
  });
  it("replaces characters the font cannot draw", () => {
    expect(drawable("a€b\nc", fakeFont)).toBe("a b\nc");
  });
});

describe("embeddedRuns", () => {
  it("gives each script its own run so the font library cannot flip the wrong one", () => {
    // drawing order of "Noa Levi שלום" in a right-to-left line: Hebrew on the left, the name on the right
    const visual = visualOrder("Noa Levi שלום", "rtl");
    expect(visual).toBe("םולש Noa Levi");
    // Hebrew run is handed over pre-reversed (the library reverses it back); the Latin run is untouched.
    expect(embeddedRuns(visual)).toEqual([" שלום", "Noa Levi"]);
  });
  it("keeps a line of one script as one run", () => {
    expect(embeddedRuns("hello world")).toEqual(["hello world"]);
    expect(embeddedRuns("21,500 הסנכה")).toEqual([[..."21,500 הסנכה"].reverse().join("")]);
  });
  it("leaves digits and signs alone when there is no script at all", () => {
    expect(embeddedRuns("₪ 150")).toEqual(["₪ 150"]);
  });
});
