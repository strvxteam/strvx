import { describe, expect, it } from "vitest";
import { jaroWinkler } from "../../src/util/jaro-winkler.js";

const TOL = 0.001;

describe("jaroWinkler", () => {
  it("matches the canonical MARTHA/MARHTA example (~0.961)", () => {
    expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.961, 3);
  });

  it("matches the canonical DWAYNE/DUANE example (~0.840)", () => {
    expect(jaroWinkler("DWAYNE", "DUANE")).toBeCloseTo(0.84, 2);
  });

  it("matches the canonical CRATE/TRACE example (~0.733)", () => {
    expect(jaroWinkler("CRATE", "TRACE")).toBeCloseTo(0.733, 3);
  });

  it("identical strings score 1", () => {
    expect(jaroWinkler("hello", "hello")).toBe(1);
    expect(jaroWinkler("a", "a")).toBe(1);
  });

  it("both empty score 1 (vacuous identity)", () => {
    expect(jaroWinkler("", "")).toBe(1);
  });

  it("one empty scores 0", () => {
    expect(jaroWinkler("a", "")).toBe(0);
    expect(jaroWinkler("", "abc")).toBe(0);
  });

  it("totally disjoint strings score 0", () => {
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });

  it("is symmetric", () => {
    const pairs: Array<[string, string]> = [
      ["MARTHA", "MARHTA"],
      ["DWAYNE", "DUANE"],
      ["CRATE", "TRACE"],
      ["bob smith", "robert smith"],
      ["acme corp", "acme corporation"],
    ];
    for (const [a, b] of pairs) {
      const ab = jaroWinkler(a, b);
      const ba = jaroWinkler(b, a);
      expect(Math.abs(ab - ba)).toBeLessThan(TOL);
    }
  });

  it("rejects out-of-range prefix scaling factor", () => {
    expect(() => jaroWinkler("a", "a", -0.1)).toThrow(/prefix scaling/);
    expect(() => jaroWinkler("a", "a", 0.5)).toThrow(/prefix scaling/);
  });

  it("prefix boost increases score when a shared prefix exists", () => {
    // Same Jaro score, but a common prefix → JW > J.
    const j = jaroWinkler("abcd", "abef", 0); // no prefix boost
    const jw = jaroWinkler("abcd", "abef", 0.1);
    expect(jw).toBeGreaterThan(j);
    expect(jw).toBeLessThanOrEqual(1);
  });
});
