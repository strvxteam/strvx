import dotenv from "dotenv";
import path from "path";

// Load .env.local first (Next.js convention), then fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as schema from "../src/lib/db/schema";
import { db } from "../src/lib/db";
import { eq } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Create a .env.local or .env file.");
  process.exit(1);
}

function markdownToTiptap(md: string): Record<string, unknown> {
  const lines = md.split("\n");
  const content: Record<string, unknown>[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      content.push({
        type: "codeBlock",
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    if (line.startsWith("### ")) {
      content.push({ type: "heading", attrs: { level: 3 }, content: parseInline(line.slice(4)) });
      i++; continue;
    }
    if (line.startsWith("## ")) {
      content.push({ type: "heading", attrs: { level: 2 }, content: parseInline(line.slice(3)) });
      i++; continue;
    }
    if (line.startsWith("# ")) {
      content.push({ type: "heading", attrs: { level: 1 }, content: parseInline(line.slice(2)) });
      i++; continue;
    }

    if (line.startsWith("- ")) {
      const items: Record<string, unknown>[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        const text = lines[i].slice(2);
        if (text.startsWith("[x] ") || text.startsWith("[ ] ")) {
          items.push({
            type: "taskItem",
            attrs: { checked: text.startsWith("[x]") },
            content: [{ type: "paragraph", content: parseInline(text.slice(4)) }],
          });
        } else {
          items.push({
            type: "listItem",
            content: [{ type: "paragraph", content: parseInline(text) }],
          });
        }
        i++;
      }
      const isTaskList = items.every((item) => (item as { type: string }).type === "taskItem");
      content.push({ type: isTaskList ? "taskList" : "bulletList", content: items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: Record<string, unknown>[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s/, "");
        items.push({ type: "listItem", content: [{ type: "paragraph", content: parseInline(text) }] });
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    if (line.startsWith("|")) {
      const text = line.replace(/\|/g, " ").trim();
      if (!/^[\s-]+$/.test(text)) {
        content.push({ type: "paragraph", content: parseInline(text) });
      }
      i++; continue;
    }

    content.push({ type: "paragraph", content: parseInline(line) });
    i++;
  }

  return { type: "doc", content };
}

function parseInline(text: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      nodes.push({ type: "text", marks: [{ type: "bold" }], text: match[2] });
    } else if (match[3]) {
      nodes.push({ type: "text", marks: [{ type: "italic" }], text: match[3] });
    } else if (match[4]) {
      nodes.push({ type: "text", marks: [{ type: "code" }], text: match[4] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", text: text || " " }];
}

async function migrate() {
  console.log("Migrating documents to Tiptap JSON...");
  const docs = await db.select().from(schema.documents);

  for (const doc of docs) {
    if (typeof doc.content === "object" && doc.content !== null) {
      console.log(`  [skip] "${doc.title}" — already JSON`);
      continue;
    }

    const markdown = String(doc.content ?? "");
    const tiptapJson = markdownToTiptap(markdown);
    const plainText = markdown.replace(/[#*`\[\]|_>-]/g, " ").replace(/\s+/g, " ").trim();

    await db
      .update(schema.documents)
      .set({ content: tiptapJson, contentText: plainText })
      .where(eq(schema.documents.id, doc.id));
    console.log(`  [ok] "${doc.title}"`);
  }

  console.log("Done.");
  process.exit(0);
}

migrate();
