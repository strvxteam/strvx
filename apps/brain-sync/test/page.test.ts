import { describe, expect, it } from "vitest";
import { renderPage } from "../src/util/page.ts";

describe("renderPage", () => {
  it("emits valid YAML frontmatter with quoted strings where needed", () => {
    const out = renderPage({
      frontmatter: {
        slug: "people/jane-doe",
        name: "Jane Doe",
        // Contains a colon — must be quoted.
        title: "Director: Engineering",
        // Number stays unquoted.
        score: 42,
        // Booleans stay unquoted.
        active: true,
      },
      compiled: "# Jane Doe",
      timeline: [],
    });
    expect(out).toMatch(/^---\n/);
    expect(out).toContain('title: "Director: Engineering"');
    expect(out).toContain("score: 42");
    expect(out).toContain("active: true");
    expect(out).toContain("slug: people/jane-doe");
  });

  it("places the compiled body above the timeline divider", () => {
    const out = renderPage({
      frontmatter: { slug: "a/b" },
      compiled: "# Header\nBody.",
      timeline: [
        { date: "2026-05-01", kind: "note", body: "first event" },
        { date: "2026-05-10", kind: "note", body: "second event" },
      ],
    });
    const dividers = out.match(/\n---\n/g);
    expect(dividers).toHaveLength(2); // frontmatter close + timeline divider
    const timelineIdx = out.indexOf("## Timeline");
    const compiledIdx = out.indexOf("# Header");
    expect(timelineIdx).toBeGreaterThan(compiledIdx);
  });

  it("sorts timeline entries newest first", () => {
    const out = renderPage({
      frontmatter: { slug: "a/b" },
      compiled: "# title",
      timeline: [
        { date: "2026-01-01", kind: "old", body: "old event" },
        { date: "2026-12-31", kind: "new", body: "new event" },
        { date: "2026-06-15", kind: "mid", body: "mid event" },
      ],
    });
    const newIdx = out.indexOf("new event");
    const midIdx = out.indexOf("mid event");
    const oldIdx = out.indexOf("old event");
    expect(newIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(oldIdx);
  });

  it("drops null + undefined frontmatter fields", () => {
    const out = renderPage({
      frontmatter: { slug: "a/b", website: null, industry: undefined, name: "x" },
      compiled: "# x",
      timeline: [],
    });
    expect(out).not.toContain("website");
    expect(out).not.toContain("industry");
    expect(out).toContain("name: x");
  });

  it("escapes embedded double quotes inside quoted strings", () => {
    const out = renderPage({
      frontmatter: { slug: "a/b", name: 'She said "hi": hello' },
      compiled: "# x",
      timeline: [],
    });
    // Quoted because of `:`, and `"` escaped.
    expect(out).toContain('name: "She said \\"hi\\": hello"');
  });
});
