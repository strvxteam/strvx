import "dotenv/config";
import fs from "node:fs"; import path from "node:path";
import postgres from "postgres";
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) { for (const line of fs.readFileSync(envPath, "utf8").split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } }
const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });

async function test(name, fn) {
  try { const r = await fn(); console.log(`[PASS] ${name}:`, r); }
  catch (e) { console.log(`[FAIL] ${name}:`, String(e.message||e)); }
}

// 1. Partner create (as an expected-to-work shape)
await test("partner insert", async () => {
  const [p] = await sql`
    INSERT INTO partners (name, stage)
    VALUES ('QA Probe Partner', 'prospective')
    RETURNING id
  `;
  await sql`DELETE FROM partners WHERE id=${p.id}`;
  return `id=${p.id}, cleaned up`;
});

// 2. Invoice insert (match actions.ts shape)
await test("invoice insert", async () => {
  const [inv] = await sql`
    INSERT INTO invoices (invoice_number, client_name, amount, status)
    VALUES ('INV-QA-'||extract(epoch from now())::text, 'QA Probe Client', 100, 'draft')
    RETURNING id
  `;
  await sql`DELETE FROM invoices WHERE id=${inv.id}`;
  return `id=${inv.id}, cleaned up`;
});

// 3. Agent insert — match Drizzle (nick) shape with only required fields
await test("agent insert", async () => {
  const slug = "qa-agent-" + Date.now();
  const [a] = await sql`
    INSERT INTO agents (name, slug)
    VALUES ('QA Agent', ${slug})
    RETURNING id, type, status, include_components, include_corrections
  `;
  await sql`DELETE FROM agents WHERE id=${a.id}`;
  return JSON.stringify(a);
});

// 4. Pattern insert
await test("pattern insert", async () => {
  const [p] = await sql`
    INSERT INTO patterns (name, archetype, layout_tree, source_project)
    VALUES ('qa_pattern', 'List', 'root\n  child', 'strvx-internal-tool')
    RETURNING id
  `;
  await sql`DELETE FROM patterns WHERE id=${p.id}`;
  return `id=${p.id}`;
});

// 5. skill_components insert
await test("skill_component insert", async () => {
  const [lib] = await sql`SELECT id FROM skill_libraries LIMIT 1`;
  if (!lib) return "no skill_libraries row, skip";
  const slug = "qa-comp-" + Date.now();
  const [c] = await sql`
    INSERT INTO skill_components (library_id, name, slug, category)
    VALUES (${lib.id}, 'QA component', ${slug}, 'button')
    RETURNING id, status
  `;
  await sql`DELETE FROM skill_components WHERE id=${c.id}`;
  return JSON.stringify(c);
});

// 6. corrections insert
await test("correction insert", async () => {
  const [c] = await sql`
    INSERT INTO corrections (title, description, category, severity)
    VALUES ('QA correction', 'test', 'layout', 'IMPORTANT')
    RETURNING id, is_active
  `;
  await sql`DELETE FROM corrections WHERE id=${c.id}`;
  return JSON.stringify(c);
});

// 7. expenses insert (matches actions.ts)
await test("expense insert", async () => {
  const [e] = await sql`
    INSERT INTO expenses (description, amount, category, date)
    VALUES ('QA expense', 42, 'Misc', CURRENT_DATE)
    RETURNING id
  `;
  await sql`DELETE FROM expenses WHERE id=${e.id}`;
  return `id=${e.id}`;
});

// 8. goal insert (matches actions.ts)
await test("goal insert", async () => {
  const [g] = await sql`
    INSERT INTO goals (name, target_value, current_value, unit)
    VALUES ('QA goal', 1000, 0, 'dollars')
    RETURNING id
  `;
  await sql`DELETE FROM goals WHERE id=${g.id}`;
  return `id=${g.id}`;
});

await sql.end();
