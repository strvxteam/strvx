import "dotenv/config";
import fs from "node:fs"; import path from "node:path";
import postgres from "postgres";
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) { for (const line of fs.readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } }
const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
const rows = await sql`
  SELECT table_name, column_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN ('skills','time_entries','agents')
  AND column_name IN ('export_to_agent','scope','duration_minutes','hours','skill_ids','include_components','include_corrections','status','type')
  ORDER BY table_name, column_name
`;
for (const r of rows) console.log(`${r.table_name}.${r.column_name}\tnull=${r.is_nullable}\tdef=${r.column_default ?? '-'}`);

// Try a minimal skill insert to see if it works
try {
  const slug = "qa-probe-" + Date.now();
  const [s] = await sql`
    INSERT INTO skills (name, slug, scope) VALUES ('qa probe', ${slug}, 'importable')
    RETURNING id, export_to_agent, scope, type, category, priority, is_active
  `;
  console.log("SKILL INSERT OK:", JSON.stringify(s));
  await sql`DELETE FROM skills WHERE id=${s.id}`;
} catch(e) { console.log("SKILL INSERT FAIL:", String(e.message||e)); }

await sql.end();
