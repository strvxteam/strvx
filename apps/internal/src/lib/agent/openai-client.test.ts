import { describe, it, expect } from "vitest";
import { composeCacheFriendlyInput, type PromptBlock } from "./openai-client";

describe("composeCacheFriendlyInput", () => {
  it("orders blocks: system, tools, snapshot, variable", () => {
    const blocks: PromptBlock[] = [
      { role: "user", content: "thread context", cacheTier: "variable" },
      { role: "system", content: "you are the agent", cacheTier: "stable-system" },
      { role: "system", content: "TOOLS: [...]", cacheTier: "stable-tools" },
      { role: "system", content: "CRM SNAPSHOT", cacheTier: "stable-snapshot" },
    ];
    const ordered = composeCacheFriendlyInput(blocks);
    expect(ordered.map((b) => b.cacheTier)).toEqual([
      "stable-system",
      "stable-tools",
      "stable-snapshot",
      "variable",
    ]);
  });

  it("preserves order within a tier", () => {
    const blocks: PromptBlock[] = [
      { role: "user", content: "B", cacheTier: "variable" },
      { role: "user", content: "A", cacheTier: "variable" },
      { role: "system", content: "S1", cacheTier: "stable-system" },
      { role: "system", content: "S2", cacheTier: "stable-system" },
    ];
    const ordered = composeCacheFriendlyInput(blocks);
    expect(ordered.map((b) => b.content)).toEqual(["S1", "S2", "B", "A"]);
  });

  it("returns an empty array given no blocks", () => {
    expect(composeCacheFriendlyInput([])).toEqual([]);
  });
});
