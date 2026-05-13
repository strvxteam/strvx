/**
 * Apply a single migration file by relative path.
 *
 * Usage: pnpm tsx scripts/apply-one-migration.ts <relative-path>
 * Example: pnpm tsx scripts/apply-one-migration.ts supabase/migrations/015_chief_of_staff_schema.sql
 *
 * Idempotent migration files are safe to re-run. Uses the same DB connection
 * Drizzle uses (DATABASE_URL).
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const target = process.argv[2];
if (!target) {
  console.error("Usage: pnpm tsx scripts/apply-one-migration.ts <relative-path>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), target);
if (!fs.existsSync(filePath)) {
  console.error(`Migration not found: ${filePath}`);
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

async function main() {
  const contents = fs.readFileSync(filePath, "utf-8");
  console.log(`→ Applying ${path.basename(filePath)} (${contents.length} bytes)`);
  console.log(`  Database: ${connectionString!.replace(/:[^:@]+@/, ":****@")}`);
  try {
    await sql.unsafe(contents);
    console.log(`  OK`);
  } catch (err) {
    console.error(`  FAILED`);
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}
main();
