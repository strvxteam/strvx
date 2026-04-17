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

// 1. Pick a user
const [user] = await sql`SELECT id FROM users LIMIT 1`;
if (!user) { console.log("no user"); process.exit(1); }

// 2. Try the exact shape Drizzle INSERT would produce (no duration_minutes)
try {
  const [inserted] = await sql`
    INSERT INTO time_entries (user_id, date, hours, description, billable)
    VALUES (${user.id}, CURRENT_DATE, '1.5', 'QA TEST - DELETE ME', true)
    RETURNING id, hours, duration_minutes
  `;
  console.log("INSERT SUCCESS:", JSON.stringify(inserted));
  // cleanup
  await sql`DELETE FROM time_entries WHERE id=${inserted.id}`;
  console.log("cleanup done");
} catch (e) {
  console.log("INSERT FAILED:", String(e.message || e));
}

await sql.end();
