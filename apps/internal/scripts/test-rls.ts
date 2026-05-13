/**
 * RLS verification suite for the chief-of-staff agent schema.
 *
 * Usage:
 *   RUN_RLS_TESTS=1 pnpm agent:test-rls
 *   RUN_RLS_TESTS=1 pnpm agent:test-rls --i-mean-it   # required when DB looks like prod
 *
 * For every agent table we run four checks inside short-lived transactions
 * that always ROLLBACK so no data is mutated:
 *
 *   1) baseline           — count rows as the connection's underlying
 *                           postgres super-user role (RLS bypassed).
 *   2) external-user SELECT — set request.jwt.claims to an @external.com
 *                           email + SET LOCAL ROLE authenticated; expect 0
 *                           rows returned.
 *   3) strvx-user SELECT  — same shape but with an @strvx.com email; expect
 *                           the row count to equal the baseline.
 *   4) external-user INSERT — attempt a minimal INSERT as the external user.
 *                           Expect either a row-security violation OR an
 *                           upstream constraint error (FK / NOT NULL).
 *
 * Plus one negative control:
 *   5) task_assignees     — has no RLS (see migration 003). Both roles must
 *                           be able to read it; this proves the test harness
 *                           can tell the difference between "RLS is
 *                           enforcing" and "the harness is broken".
 *
 * Exit codes: 0 if every check passes, 1 otherwise.
 *
 * Gated behind RUN_RLS_TESTS so CI environments without a DB don't crash.
 */

import dotenv from "dotenv";
import path from "node:path";
import postgres from "postgres";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const STRVX_EMAIL = "nick@strvx.com";
const EXTERNAL_EMAIL = "attacker@external.com";

if (!process.env.RUN_RLS_TESTS) {
  console.log("RLS tests skipped: set RUN_RLS_TESTS=1 to run.");
  console.log(
    "(this gate exists so CI without a database doesn't fall over on import)"
  );
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

// Belt-and-suspenders production guard.
const looksLikeProd =
  /prod/i.test(connectionString) ||
  process.env.DATABASE_ENV === "production" ||
  process.env.VERCEL_ENV === "production";
const iMeantIt = process.argv.includes("--i-mean-it");
if (looksLikeProd && !iMeantIt) {
  console.error(
    "\n⚠️  DATABASE_URL looks like production. Pass --i-mean-it to override."
  );
  console.error(
    "    All operations roll back, but defense in depth — confirm explicitly.\n"
  );
  process.exit(1);
}

// ── Tables under test ───────────────────────────────────────────────────

type InsertBuilder = (uuids: { a: string; b: string; c: string }) => {
  sql: string;
  params: unknown[];
};

interface TableSpec {
  name: string;
  buildInsert?: InsertBuilder;
}

const AGENT_TABLES: TableSpec[] = [
  {
    name: "mailbox_oauth_tokens",
    buildInsert: () => ({
      sql: `INSERT INTO mailbox_oauth_tokens
              (email, access_token_encrypted, refresh_token_encrypted, expiry_date, scopes)
            VALUES ($1, $2, $3, $4, $5)`,
      params: [
        `rls-test-${Date.now()}@example.com`,
        "enc-access",
        "enc-refresh",
        Date.now() + 3600_000,
        ["gmail.modify"],
      ],
    }),
  },
  {
    name: "mailbox_watches",
    buildInsert: ({ a }) => ({
      sql: `INSERT INTO mailbox_watches
              (mailbox_id, history_id, expiration, topic_name)
            VALUES ($1, $2, now(), $3)`,
      params: [a, "1", "projects/x/topics/y"],
    }),
  },
  {
    name: "email_threads",
    buildInsert: ({ a }) => ({
      sql: `INSERT INTO email_threads
              (mailbox_id, last_message_at)
            VALUES ($1, now())`,
      params: [a],
    }),
  },
  {
    name: "email_messages",
    buildInsert: ({ a, b }) => ({
      sql: `INSERT INTO email_messages
              (thread_id, mailbox_id, gmail_message_id, from_email, direction, sent_at)
            VALUES ($1, $2, $3, $4, 'inbound', now())`,
      params: [a, b, "g-msg-rls-test", "x@example.com"],
    }),
  },
  {
    name: "email_attachments",
    buildInsert: ({ a }) => ({
      sql: `INSERT INTO email_attachments (message_id, filename) VALUES ($1, $2)`,
      params: [a, "rls-test.pdf"],
    }),
  },
  {
    name: "cos_runs",
    buildInsert: () => ({
      sql: `INSERT INTO cos_runs (kind, status) VALUES ('classify', 'running')`,
      params: [],
    }),
  },
  {
    name: "agent_classifications",
    buildInsert: ({ a, b }) => ({
      sql: `INSERT INTO agent_classifications
              (message_id, thread_id, category, urgency, intent, requires_reply)
            VALUES ($1, $2, 'lead_inquiry', 'normal', 'reply_needed', true)`,
      params: [a, b],
    }),
  },
  {
    name: "scheduling_proposals",
    buildInsert: ({ a, b }) => ({
      sql: `INSERT INTO scheduling_proposals
              (thread_id, mailbox_id, kind, duration_minutes, meeting_title,
               proposed_slots, attendees)
            VALUES ($1, $2, 'new_meeting', 30, 'RLS test', '[]'::jsonb, '[]'::jsonb)`,
      params: [a, b],
    }),
  },
  {
    name: "email_drafts",
    buildInsert: ({ a, b }) => ({
      sql: `INSERT INTO email_drafts
              (thread_id, mailbox_id, to_emails, subject, body_text)
            VALUES ($1, $2, ARRAY['x@example.com']::text[], 'subj', 'body')`,
      params: [a, b],
    }),
  },
  {
    name: "follow_up_watchers",
    buildInsert: () => ({
      sql: `INSERT INTO follow_up_watchers (kind, trigger_after)
            VALUES ('stale_thread', now())`,
      params: [],
    }),
  },
  {
    name: "daily_briefs",
    buildInsert: () => ({
      sql: `INSERT INTO daily_briefs (date, content_markdown) VALUES ($1, $2)`,
      params: [`9999-01-01`, "rls-test"],
    }),
  },
  {
    name: "meeting_prep_briefs",
    buildInsert: () => ({
      sql: `INSERT INTO meeting_prep_briefs (calendar_event_id, content_markdown)
            VALUES ($1, $2)`,
      params: [`rls-test-${Date.now()}`, "rls-test"],
    }),
  },
  {
    name: "agent_settings",
    buildInsert: ({ a }) => ({
      sql: `INSERT INTO agent_settings (mailbox_id) VALUES ($1)`,
      params: [a],
    }),
  },
  {
    name: "crm_hygiene_flags",
    buildInsert: ({ a }) => ({
      sql: `INSERT INTO crm_hygiene_flags (kind, entity_kind, entity_id)
            VALUES ('stale_engagement', 'engagement', $1)`,
      params: [a],
    }),
  },
  {
    name: "agent_voice_samples",
    buildInsert: ({ a, b }) => ({
      sql: `INSERT INTO agent_voice_samples (mailbox_id, email_message_id)
            VALUES ($1, $2)`,
      params: [a, b],
    }),
  },
];

// Negative control — created without RLS.
const NO_RLS_CONTROL = "task_assignees";

// ── Test harness ────────────────────────────────────────────────────────

interface CheckResult {
  table: string;
  check: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(table: string, check: string, ok: boolean, detail: string) {
  results.push({ table, check, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${table} :: ${check} — ${detail}`);
}

const sql = postgres(connectionString, { prepare: false });

async function countRowsAsRole(
  table: string,
  email: string | null
): Promise<number> {
  return await sql.begin(async (tx) => {
    if (email !== null) {
      const claims = JSON.stringify({ email, role: "authenticated" });
      await tx.unsafe(
        `SELECT set_config('request.jwt.claims', $1::text, true)`,
        [claims]
      );
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
    }
    const safeTable = quoteIdent(table);
    const rows = await tx.unsafe(`SELECT count(*)::int AS c FROM ${safeTable}`);
    const first = (rows as unknown as { c: number }[])[0];
    return Number(first.c);
  });
}

async function tryInsertAsExternal(
  spec: TableSpec
): Promise<{ rejected: boolean; reason: string }> {
  if (!spec.buildInsert) {
    return { rejected: true, reason: "no insert builder — skipped" };
  }
  const claims = JSON.stringify({
    email: EXTERNAL_EMAIL,
    role: "authenticated",
  });
  const uuids = {
    a: "00000000-0000-0000-0000-000000000001",
    b: "00000000-0000-0000-0000-000000000002",
    c: "00000000-0000-0000-0000-000000000003",
  };
  const payload = spec.buildInsert(uuids);

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('request.jwt.claims', $1::text, true)`,
        [claims]
      );
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
      await tx.unsafe(payload.sql, payload.params as never[]);
      throw new Error("__rls_unexpected_insert_succeeded__");
    });
    return {
      rejected: false,
      reason: "INSERT committed despite external-user role (this is bad)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("__rls_unexpected_insert_succeeded__")) {
      return {
        rejected: false,
        reason: "INSERT row-policy did not reject (this is bad)",
      };
    }
    return { rejected: true, reason: shortError(msg) };
  }
}

function shortError(msg: string): string {
  const firstLine = msg.split("\n")[0];
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine;
}

function quoteIdent(ident: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error(`refusing to quote suspicious identifier: ${ident}`);
  }
  return `"${ident}"`;
}

// ── Main ────────────────────────────────────────────────────────────────

async function runAgentTableSuite(spec: TableSpec): Promise<void> {
  console.log(`\n── ${spec.name} ──`);
  let baseline = 0;
  try {
    baseline = await countRowsAsRole(spec.name, null);
    record(
      spec.name,
      "baseline",
      true,
      `service-role count = ${baseline}`
    );
  } catch (err) {
    record(spec.name, "baseline", false, shortError(String(err)));
    return;
  }

  try {
    const externalCount = await countRowsAsRole(spec.name, EXTERNAL_EMAIL);
    record(
      spec.name,
      "external-user-select",
      externalCount === 0,
      `external-user count = ${externalCount} (expected 0)`
    );
  } catch (err) {
    const msg = shortError(String(err));
    const isPolicyFailure =
      /row.level.security|policy|permission denied/i.test(msg);
    record(
      spec.name,
      "external-user-select",
      isPolicyFailure,
      isPolicyFailure
        ? `RLS rejected SELECT (${msg})`
        : `unexpected error: ${msg}`
    );
  }

  try {
    const strvxCount = await countRowsAsRole(spec.name, STRVX_EMAIL);
    record(
      spec.name,
      "strvx-user-select",
      strvxCount === baseline,
      `strvx-user count = ${strvxCount} (expected ${baseline})`
    );
  } catch (err) {
    record(spec.name, "strvx-user-select", false, shortError(String(err)));
  }

  const insertOutcome = await tryInsertAsExternal(spec);
  record(
    spec.name,
    "external-user-insert",
    insertOutcome.rejected,
    insertOutcome.rejected
      ? `INSERT rejected — ${insertOutcome.reason}`
      : insertOutcome.reason
  );
}

async function runNegativeControl(): Promise<void> {
  console.log(`\n── ${NO_RLS_CONTROL} (negative control: no RLS) ──`);
  let baseline = 0;
  try {
    baseline = await countRowsAsRole(NO_RLS_CONTROL, null);
    record(
      NO_RLS_CONTROL,
      "baseline",
      true,
      `service-role count = ${baseline}`
    );
  } catch (err) {
    record(NO_RLS_CONTROL, "baseline", false, shortError(String(err)));
    return;
  }

  try {
    const externalCount = await countRowsAsRole(
      NO_RLS_CONTROL,
      EXTERNAL_EMAIL
    );
    record(
      NO_RLS_CONTROL,
      "external-user-select-uncontrolled",
      externalCount === baseline,
      `external-user count = ${externalCount} (expected ${baseline}; if 0, RLS got silently enabled)`
    );
  } catch (err) {
    record(
      NO_RLS_CONTROL,
      "external-user-select-uncontrolled",
      false,
      shortError(String(err))
    );
  }
}

async function main(): Promise<void> {
  const masked = connectionString!.replace(/:[^:@]+@/, ":****@");
  console.log("RLS verification suite\n");
  console.log(`  Database: ${masked}`);
  console.log(`  strvx identity:    ${STRVX_EMAIL}`);
  console.log(`  external identity: ${EXTERNAL_EMAIL}`);

  for (const spec of AGENT_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await runAgentTableSuite(spec);
  }
  await runNegativeControl();

  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("\n────────────────────────────────────────────────────────");
  console.log(`Summary: ${passed}/${total} checks passed`);

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  - ${f.table} :: ${f.check} — ${f.detail}`);
    }
  }

  await sql.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("RLS suite crashed:", err);
  try {
    await sql.end();
  } catch {
    // best-effort
  }
  process.exit(1);
});
