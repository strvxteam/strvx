// One-time script to deduplicate Tiptap JSON content in documents where
// the content was accidentally multiplied by the Yjs double-init bug.
//
// Run with: npx tsx scripts/dedup-doc-content.ts [--doc "Title"] [--dry-run]
// Examples:
//   npx tsx scripts/dedup-doc-content.ts --doc "Confidential"
//   npx tsx scripts/dedup-doc-content.ts --dry-run   (preview all docs that need dedup)

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { db } from "../src/lib/db";
import { documents } from "../src/lib/db/schema";
import { eq, like } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const docTitleIndex = args.indexOf("--doc");
const targetTitle = docTitleIndex !== -1 ? args[docTitleIndex + 1] : null;

type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: unknown[];
};

type TiptapDoc = {
  type: "doc";
  content: TiptapNode[];
};

function nodeKey(node: TiptapNode): string {
  return JSON.stringify(node);
}

/**
 * Detect how many times the content repeats by checking if the block array
 * is a perfect N-repetition of a shorter sequence.
 */
function findRepeatFactor(blocks: TiptapNode[]): number {
  const total = blocks.length;
  for (let factor = 2; factor <= total; factor++) {
    if (total % factor !== 0) continue;
    const unitLen = total / factor;
    const unit = blocks.slice(0, unitLen).map(nodeKey);
    let isRepeat = true;
    for (let i = 1; i < factor; i++) {
      const slice = blocks.slice(i * unitLen, (i + 1) * unitLen).map(nodeKey);
      if (slice.join("|") !== unit.join("|")) {
        isRepeat = false;
        break;
      }
    }
    if (isRepeat) return factor;
  }
  return 1;
}

async function main() {
  const query = targetTitle
    ? db.select().from(documents).where(like(documents.title, `%${targetTitle}%`))
    : db.select().from(documents);

  const docs = await query;
  console.log(`Found ${docs.length} document(s) to check.\n`);

  let fixed = 0;

  for (const doc of docs) {
    if (!doc.content) continue;

    const tiptap = doc.content as unknown as TiptapDoc;
    if (tiptap.type !== "doc" || !Array.isArray(tiptap.content)) continue;

    const factor = findRepeatFactor(tiptap.content);
    if (factor === 1) {
      console.log(`  ✓ "${doc.title}" — no duplication detected`);
      continue;
    }

    const unitLen = tiptap.content.length / factor;
    const deduped: TiptapDoc = {
      type: "doc",
      content: tiptap.content.slice(0, unitLen),
    };

    const dedupedText = deduped.content
      .map((n) => n.content?.map((c) => c.text ?? "").join("") ?? "")
      .join("\n")
      .trim();

    console.log(
      `  ✗ "${doc.title}" — content repeated ${factor}x (${tiptap.content.length} blocks → ${unitLen} blocks)`
    );

    if (dryRun) {
      console.log(`    [dry-run] would truncate to ${unitLen} blocks`);
    } else {
      await db
        .update(documents)
        .set({
          content: deduped as unknown as Record<string, unknown>,
          contentText: dedupedText,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
      console.log(`    ✅ Fixed — truncated to ${unitLen} blocks`);
      fixed++;
    }
  }

  console.log(`\nDone. ${dryRun ? "(dry-run)" : `${fixed} document(s) fixed.`}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
