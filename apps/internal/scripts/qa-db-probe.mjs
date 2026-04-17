// Probe live DB column lists for all tables referenced in schema.ts.
// Prints table,columns (JSON-sorted) so we can diff vs schema.ts.
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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL set");
  process.exit(1);
}

const sql = postgres(url, { max: 2, prepare: false });

// Tables from schema.ts
const tables = [
  "users","companies","contacts","engagements","stage_history","interactions",
  "next_actions","monitored_sites","uptime_checks","projects","project_members",
  "calendar_events","tasks","task_assignees","recurring_invoice_schedules","invoices",
  "invoice_reconciliations","expenses","goals","time_entries","marketing_posts",
  "documents","portal_tokens","gmail_sync_state","partners","partner_contacts",
  "partner_links","partner_interactions","partner_invoices","partner_stage_history",
  "bookings","follow_up_links","booking_members","audit_logs","credit_cards",
  "card_budgets","card_receipts","card_alerts","skill_libraries","skill_components",
  "skills","skill_component_links","agents","agent_rule_links","agent_runs",
  "corrections","patterns",
];

const result = {};
for (const t of tables) {
  try {
    const rows = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=${t}
      ORDER BY column_name
    `;
    if (rows.length === 0) {
      result[t] = { missing: true };
    } else {
      result[t] = rows.map(r => ({
        c: r.column_name,
        t: r.data_type,
        n: r.is_nullable,
      }));
    }
  } catch (e) {
    result[t] = { error: String(e.message || e) };
  }
}

console.log(JSON.stringify(result, null, 0));
await sql.end();
