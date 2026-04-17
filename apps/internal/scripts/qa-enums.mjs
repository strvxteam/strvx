import "dotenv/config";
import fs from "node:fs"; import path from "node:path";
import postgres from "postgres";
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) { for (const line of fs.readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } }
const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });

// Check correction_severity enum values
const enums = await sql`
  SELECT t.typname, e.enumlabel
  FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typname IN ('correction_severity','correction_category','skill_category','skill_type','agent_type','agent_status','component_category','component_status')
  ORDER BY t.typname, e.enumsortorder
`;
for (const e of enums) console.log(`${e.typname}: ${e.enumlabel}`);

console.log("\n-- patterns check constraints --");
const chk = await sql`
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'patterns'::regclass AND contype = 'c'
`;
for (const c of chk) console.log(c.conname, '::', c.pg_get_constraintdef);

await sql.end();
