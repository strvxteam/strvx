import "dotenv/config";
import fs from "node:fs"; import path from "node:path";
import postgres from "postgres";
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) { for (const line of fs.readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } }
const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });

// count of rows in key tables
const tables = ['users','clients' /*alias for companies*/,'engagements','invoices','skills','agents','patterns','corrections','skill_components','skill_libraries','partners','time_entries'];
for (const t of tables) {
  try {
    const tbl = t === 'clients' ? 'companies' : t;
    const [r] = await sql`SELECT COUNT(*)::int AS c FROM ${sql(tbl)}`;
    console.log(`${tbl}: ${r.c}`);
  } catch (e) { console.log(`${t}: err ${e.message}`); }
}

// Check if agent_rule_links skillId column — confirm name aligns
const agentRuleCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='agent_rule_links'
  ORDER BY column_name
`;
console.log("\nagent_rule_links cols:", agentRuleCols.map(r => r.column_name).join(","));

// Check pool + session capability with a couple of concurrent queries
const start = Date.now();
await Promise.all(Array.from({length:5}, (_,i) => sql`SELECT ${i}::int AS x, pg_sleep(0.05)`));
console.log(`5 parallel queries: ${Date.now() - start}ms`);

await sql.end();
