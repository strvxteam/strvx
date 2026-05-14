#!/usr/bin/env -S tsx
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { createClient } from "../db.ts";
import { renderCompanies } from "../render/company.ts";
import { renderPeople } from "../render/person.ts";
import { renderDeals } from "../render/deal.ts";
import { renderProjects } from "../render/project.ts";
import { renderMeetings } from "../render/meeting.ts";
import { renderFinances } from "../render/finance.ts";
import { stageTranscripts } from "../render/transcripts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // apps/brain-sync/src/cli/sync.ts → ../../../../brain
  const brainDir =
    process.env.BRAIN_DIR ?? resolve(__dirname, "../../../..", "brain");
  const force = process.argv.includes("--force");

  console.log(`brain dir:   ${brainDir}`);
  console.log(`force-clean: ${force}`);

  const sql = createClient();
  try {
    await ensureDirs(brainDir);
    if (force) await wipeGeneratedDirs(brainDir);

    console.log("rendering companies + partners…");
    const companies = await renderCompanies(sql, brainDir);
    console.log(`  ${companies.size} pages`);

    console.log("rendering people…");
    const people = await renderPeople(sql, brainDir, companies);
    console.log(`  ${people.size} contact pages (plus team users)`);

    console.log("rendering deals…");
    const deals = await renderDeals(sql, brainDir, companies, people);
    console.log(`  ${deals.size} deal pages`);

    console.log("rendering projects…");
    const projects = await renderProjects(sql, brainDir, deals);
    console.log(`  ${projects.size} project pages`);

    console.log("rendering meetings…");
    const meetings = await renderMeetings(sql, brainDir, deals);
    console.log(`  ${meetings.size} meeting pages`);

    console.log("rendering finances…");
    await renderFinances(sql, brainDir, deals);
    console.log(`  finances done`);

    console.log("staging transcripts for dream cycle…");
    const tx = await stageTranscripts(sql, brainDir);
    console.log(`  ${tx.meetings} meeting transcripts, ${tx.threads} email threads`);

    console.log("done.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function ensureDirs(brainDir: string) {
  for (const sub of [
    "people",
    "companies",
    "deals",
    "projects",
    "meetings",
    "finances",
    "inbox",
  ]) {
    await mkdir(resolve(brainDir, sub), { recursive: true });
  }
}

async function wipeGeneratedDirs(brainDir: string) {
  // Delete only generated .md files; keep README.md (handwritten) and RESOLVER.md.
  for (const sub of ["people", "companies", "deals", "projects", "meetings", "finances"]) {
    const dir = resolve(brainDir, sub);
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (name.startsWith("_")) continue;
      if (!name.endsWith(".md")) continue;
      await unlink(resolve(dir, name));
    }
  }
}

main().catch((err) => {
  console.error("[brain-sync] fatal:", err);
  process.exit(1);
});
