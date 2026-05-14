/**
 * Render a gbrain-shaped page: YAML frontmatter, compiled-truth above `---`,
 * timeline below. We hand-roll the YAML — every field we emit is a string,
 * number, boolean, or ISO date, no need for a full YAML library.
 */

export type PageFrontmatter = Record<string, string | number | boolean | null | undefined>;

export interface TimelineEntry {
  /** ISO date — used for chronological sort and rendered as the entry header. */
  date: string;
  /** Short kind label: "email", "meeting", "stage change", "note", … */
  kind: string;
  /** Markdown body (already formatted, no leading `### `). */
  body: string;
}

export interface PageInput {
  frontmatter: PageFrontmatter;
  /** Markdown above the timeline divider. Should NOT contain `---` on its own line. */
  compiled: string;
  /** Timeline entries; we'll sort newest first. */
  timeline: TimelineEntry[];
}

function renderFrontmatter(fm: PageFrontmatter): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    const v =
      typeof value === "string"
        ? quoteIfNeeded(value)
        : typeof value === "boolean"
          ? value ? "true" : "false"
          : String(value);
    lines.push(`${key}: ${v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function quoteIfNeeded(s: string): string {
  // Quote when the string contains YAML-significant characters or could be parsed as a different type.
  if (s === "" || /^[\s'"#&*!|>%@`{}[\],:?-]|[\s'"#&*!|>%@`{}[\],:?-]$|[\n:#]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return s;
}

function renderTimeline(entries: TimelineEntry[]): string {
  if (entries.length === 0) return "";
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const out = ["---", "", "## Timeline", ""];
  for (const e of sorted) {
    out.push(`### ${e.date} — ${e.kind}`);
    out.push("");
    out.push(e.body.trim());
    out.push("");
  }
  return out.join("\n");
}

export function renderPage({ frontmatter, compiled, timeline }: PageInput): string {
  const parts: string[] = [renderFrontmatter(frontmatter), "", compiled.trim(), ""];
  const tl = renderTimeline(timeline);
  if (tl) parts.push(tl);
  return parts.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
