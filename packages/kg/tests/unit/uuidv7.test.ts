import { describe, expect, it } from "vitest";
import { uuidv7 } from "../../src/util/uuidv7.js";

const UUIDV7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("emits a string in canonical v7 format", () => {
    const id = uuidv7();
    expect(id).toMatch(UUIDV7_RE);
  });

  it("emits 1000 distinct ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(uuidv7());
    }
    expect(seen.size).toBe(1000);
  });

  it("ids generated 5ms apart are lexicographically ordered", async () => {
    const first = uuidv7();
    await new Promise((r) => setTimeout(r, 5));
    const second = uuidv7();
    expect(second > first).toBe(true);
  });

  it("explicit `now` parameter controls the leading timestamp bits", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    // Strip the random tail — compare only the time-prefix bytes.
    expect(b.slice(0, 13) > a.slice(0, 13)).toBe(true);
  });
});
