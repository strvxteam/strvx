/**
 * Apply RLS policies to the Supabase database.
 *
 * Usage: pnpm tsx scripts/apply-rls.ts
 *
 * Reads supabase/migrations/001_enable_rls.sql and executes it against
 * the DATABASE_URL. Uses the postgres superuser connection (same as Drizzle)
 * so it has permission to ALTER TABLE and CREATE POLICY.
 *
 * Safe to run multiple times — all statements are idempotent.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  console.error("Set it in .env or pass it inline:");
  console.error("  DATABASE_URL=postgresql://... pnpm tsx scripts/apply-rls.ts");
  process.exit(1);
}

async function main() {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/001_enable_rls.sql"
  );

  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migration = fs.readFileSync(migrationPath, "utf-8");

  console.log("Applying RLS migration...");
  console.log(`  Database: ${process.env.DATABASE_URL!.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`  File: ${migrationPath}`);
  console.log("");

  try {
    await db.execute(sql.raw(migration));
    console.log("RLS migration applied successfully.");
    console.log("");
    console.log("Summary:");
    console.log("  - RLS enabled on 20 tables");
    console.log("  - authenticated role: full CRUD on all tables");
    console.log("  - anon role: no access (default deny)");
    console.log("  - auth_id column added to users table");
  } catch (err) {
    console.error("Failed to apply RLS migration:");
    console.error(err);
    process.exit(1);
  }
}

main();
