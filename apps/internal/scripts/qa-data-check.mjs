import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });

const te = await sql`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE hours IS NULL) AS null_hours,
    COUNT(*) FILTER (WHERE duration_minutes IS NULL) AS null_duration
  FROM time_entries
`;

const migrations = await sql`
  SELECT version, name FROM supabase_migrations.schema_migrations
  ORDER BY version DESC LIMIT 30
`;

console.log("time_entries:", JSON.stringify(te[0]));
console.log("\nmigrations:");
for (const m of migrations) console.log(` ${m.version} ${m.name}`);

await sql.end();
