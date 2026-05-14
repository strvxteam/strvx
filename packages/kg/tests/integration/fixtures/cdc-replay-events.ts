import type { CDCEventLike } from "../../../src/writes/upsert-from-postgres.js";

/**
 * Realistic mixed-event CDC fixture for the M2.T8 replay test.
 *
 * Conventions:
 *  - All ids are prefixed `r-` (replay) so they're disjoint from ids used
 *    in upsert-from-postgres.test.ts (co-1, ct-1, co-future, co-lifecycle,
 *    ct-orphan).
 *  - LSNs increase monotonically across the fixture: `0/00000001` … 0x32.
 *  - Events are grouped by scenario with section comments.
 *  - Total: 50 events. Covers all 10 mapped tables + unmapped + edge cases.
 *
 * Apply-once → snapshot → apply-again should yield byte-equivalent graph.
 */
export const REPLAY_EVENTS: CDCEventLike[] = [
  // ── Scenario: parent-before-child (companies, then contacts) ──────────
  {
    kind: "insert",
    table: "companies",
    row: { id: "r-co-1", name: "Replay Corp", industry: "SaaS", created_at: "2026-01-02" },
    lsn: "0/00000001",
  },
  {
    kind: "insert",
    table: "companies",
    row: { id: "r-co-2", name: "Beta Industries", industry: "Manufacturing" },
    lsn: "0/00000002",
  },
  {
    kind: "insert",
    table: "contacts",
    row: {
      id: "r-ct-1",
      company_id: "r-co-1",
      name: "Alice Replay",
      email: "ALICE@REPLAY.COM",
      role: "CTO",
    },
    lsn: "0/00000003",
  },
  {
    kind: "insert",
    table: "contacts",
    row: {
      id: "r-ct-2",
      company_id: "r-co-2",
      name: "Bob Beta",
      email: "bob@beta.com",
      role: "VP Eng",
    },
    lsn: "0/00000004",
  },

  // ── Scenario: child-before-parent (engagement points to unknown company stub) ──
  {
    kind: "insert",
    table: "engagements",
    row: {
      id: "r-eng-1",
      company_id: "r-co-future",
      name: "Stub Parent Deal",
      stage: "discovery",
      deal_value: 50000,
    },
    lsn: "0/00000005",
  },
  // Real parent arrives later — stub upgrades.
  {
    kind: "insert",
    table: "companies",
    row: { id: "r-co-future", name: "Future Replay Inc", industry: "Fintech" },
    lsn: "0/00000006",
  },

  // ── Scenario: more engagements (existing parents) ─────────────────────
  {
    kind: "insert",
    table: "engagements",
    row: {
      id: "r-eng-2",
      company_id: "r-co-1",
      name: "Replay Corp - Q1 Deal",
      stage: "proposal",
      deal_value: 120000,
    },
    lsn: "0/00000007",
  },
  {
    kind: "insert",
    table: "engagements",
    row: {
      id: "r-eng-3",
      company_id: "r-co-2",
      name: "Beta Expansion",
      stage: "negotiation",
      deal_value: 80000,
    },
    lsn: "0/00000008",
  },

  // ── Scenario: update changes property on existing node (re-MERGE) ─────
  {
    kind: "update",
    table: "engagements",
    row: {
      id: "r-eng-2",
      company_id: "r-co-1",
      name: "Replay Corp - Q1 Deal",
      stage: "closed_won", // stage progressed
      deal_value: 130000, // value bumped after negotiation
    },
    lsn: "0/00000009",
  },
  {
    kind: "update",
    table: "contacts",
    row: {
      id: "r-ct-1",
      company_id: "r-co-1",
      name: "Alice Replay",
      email: "alice.replay@replay.com", // email changed
      role: "Chief Technology Officer", // role expanded
    },
    lsn: "0/0000000A",
  },

  // ── Scenario: interactions (children of engagements) ──────────────────
  {
    kind: "insert",
    table: "interactions",
    row: {
      id: "r-int-1",
      engagement_id: "r-eng-1",
      type: "call",
      content: "Initial discovery call. Strong interest.",
      scheduled_at: "2026-01-15T10:00:00Z",
    },
    lsn: "0/0000000B",
  },
  {
    kind: "insert",
    table: "interactions",
    row: {
      id: "r-int-2",
      engagement_id: "r-eng-2",
      type: "email",
      content: "Sent proposal v2.",
      scheduled_at: "2026-01-20T14:30:00Z",
    },
    lsn: "0/0000000C",
  },
  {
    kind: "update",
    table: "interactions",
    row: {
      id: "r-int-2",
      engagement_id: "r-eng-2",
      type: "email",
      content: "Sent proposal v2. (corrected pricing)",
      scheduled_at: "2026-01-20T14:30:00Z",
    },
    lsn: "0/0000000D",
  },

  // ── Scenario: partners (entity with no relationships) ─────────────────
  {
    kind: "insert",
    table: "partners",
    row: {
      id: "r-pa-1",
      name: "PartnerOne LLC",
      website: "https://partnerone.example",
      stage: "active",
      email: "HELLO@PartnerOne.example",
    },
    lsn: "0/0000000E",
  },
  {
    kind: "insert",
    table: "partners",
    row: {
      id: "r-pa-2",
      name: "Acme Partners",
      website: "https://acme-partners.example",
      stage: "prospective",
      email: "info@acme-partners.example",
    },
    lsn: "0/0000000F",
  },
  {
    kind: "update",
    table: "partners",
    row: {
      id: "r-pa-2",
      name: "Acme Partners",
      website: "https://acme-partners.example",
      stage: "active", // promoted from prospective
      email: "info@acme-partners.example",
    },
    lsn: "0/00000010",
  },

  // ── Scenario: projects (link to engagements) ──────────────────────────
  {
    kind: "insert",
    table: "projects",
    row: {
      id: "r-pr-1",
      engagement_id: "r-eng-2",
      name: "Onboarding Project",
      status: "active",
      start_date: "2026-02-01",
    },
    lsn: "0/00000011",
  },
  {
    kind: "insert",
    table: "projects",
    row: {
      id: "r-pr-2",
      engagement_id: "r-eng-3",
      name: "Beta Migration",
      status: "planning",
      start_date: "2026-02-15",
    },
    lsn: "0/00000012",
  },
  {
    kind: "update",
    table: "projects",
    row: {
      id: "r-pr-1",
      engagement_id: "r-eng-2",
      name: "Onboarding Project",
      status: "completed",
      start_date: "2026-02-01",
      end_date: "2026-03-10", // completed_at filled in
    },
    lsn: "0/00000013",
  },

  // ── Scenario: tasks (two FKs: project + engagement) ──────────────────
  {
    kind: "insert",
    table: "tasks",
    row: {
      id: "r-ta-1",
      project_id: "r-pr-1",
      engagement_id: "r-eng-2",
      title: "Kickoff prep",
      status: "done",
      due_date: "2026-02-05",
    },
    lsn: "0/00000014",
  },
  {
    kind: "insert",
    table: "tasks",
    row: {
      id: "r-ta-2",
      project_id: "r-pr-2",
      engagement_id: "r-eng-3",
      title: "Migration plan draft",
      status: "in_progress",
      due_date: "2026-02-20",
    },
    lsn: "0/00000015",
  },
  // Task with NULL FK (project_id null) — edge for that FK should be skipped.
  {
    kind: "insert",
    table: "tasks",
    row: {
      id: "r-ta-3",
      project_id: null,
      engagement_id: "r-eng-1",
      title: "Standalone task",
      status: "open",
      due_date: "2026-02-28",
    },
    lsn: "0/00000016",
  },

  // ── Scenario: invoices (FinancialEvent) ───────────────────────────────
  {
    kind: "insert",
    table: "invoices",
    row: {
      id: "r-in-1",
      engagement_id: "r-eng-2",
      invoice_number: "INV-001",
      amount: 12000,
      status: "sent",
      client_name: "Replay Corp",
      issued_date: "2026-02-01",
      due_date: "2026-03-01",
    },
    lsn: "0/00000017",
  },
  {
    kind: "insert",
    table: "invoices",
    row: {
      id: "r-in-2",
      engagement_id: "r-eng-3",
      invoice_number: "INV-002",
      amount: 25000,
      status: "draft",
      client_name: "Beta Industries",
      issued_date: "2026-02-10",
      due_date: "2026-03-10",
    },
    lsn: "0/00000018",
  },
  {
    kind: "update",
    table: "invoices",
    row: {
      id: "r-in-1",
      engagement_id: "r-eng-2",
      invoice_number: "INV-001",
      amount: 12000,
      status: "paid", // status moved sent → paid
      client_name: "Replay Corp",
      issued_date: "2026-02-01",
      due_date: "2026-03-01",
      paid_date: "2026-02-25",
    },
    lsn: "0/00000019",
  },

  // ── Scenario: expenses (no relationships, just nodes) ────────────────
  {
    kind: "insert",
    table: "expenses",
    row: {
      id: "r-ex-1",
      description: "AWS bill",
      amount: 412.5,
      category: "infrastructure",
      vendor: "Amazon Web Services",
      date: "2026-02-01",
    },
    lsn: "0/0000001A",
  },
  {
    kind: "insert",
    table: "expenses",
    row: {
      id: "r-ex-2",
      description: "Stripe fees",
      amount: 156.8,
      category: "payments",
      vendor: "Stripe",
      date: "2026-02-15",
    },
    lsn: "0/0000001B",
  },
  {
    kind: "update",
    table: "expenses",
    row: {
      id: "r-ex-1",
      description: "AWS bill (Feb)",
      amount: 412.5,
      category: "infrastructure",
      vendor: "Amazon Web Services",
      date: "2026-02-01",
    },
    lsn: "0/0000001C",
  },

  // ── Scenario: calendar_events (Communication; two FK edges) ──────────
  {
    kind: "insert",
    table: "calendar_events",
    row: {
      id: "r-ce-1",
      engagement_id: "r-eng-2",
      project_id: "r-pr-1",
      title: "Kickoff meeting",
      date: "2026-02-05",
      type: "meeting",
      zoom_link: "https://zoom.example/abc",
    },
    lsn: "0/0000001D",
  },
  {
    kind: "insert",
    table: "calendar_events",
    row: {
      id: "r-ce-2",
      engagement_id: "r-eng-3",
      project_id: "r-pr-2",
      title: "Beta sync",
      date: "2026-02-18",
      type: "meeting",
      zoom_link: "https://zoom.example/def",
    },
    lsn: "0/0000001E",
  },
  // calendar_event with NULL project_id — project edge skipped, engagement edge kept.
  {
    kind: "insert",
    table: "calendar_events",
    row: {
      id: "r-ce-3",
      engagement_id: "r-eng-1",
      project_id: null,
      title: "Discovery follow-up",
      date: "2026-01-22",
      type: "call",
    },
    lsn: "0/0000001F",
  },

  // ── Scenario: duplicate event (same LSN replayed back-to-back) ────────
  // Same payload, identical LSN. Should produce zero churn.
  {
    kind: "insert",
    table: "contacts",
    row: {
      id: "r-ct-3",
      company_id: "r-co-1",
      name: "Carol Replay",
      email: "carol@replay.com",
      role: "Engineer",
    },
    lsn: "0/00000020",
  },
  {
    kind: "insert",
    table: "contacts",
    row: {
      id: "r-ct-3",
      company_id: "r-co-1",
      name: "Carol Replay",
      email: "carol@replay.com",
      role: "Engineer",
    },
    lsn: "0/00000020", // identical LSN, identical payload
  },

  // ── Scenario: unmapped table (publication-included extras, should noop) ──
  {
    kind: "insert",
    table: "audit_log_entries",
    row: { id: "audit-1", message: "system event" },
    lsn: "0/00000021",
  },
  {
    kind: "update",
    table: "feature_flags",
    row: { id: "ff-1", enabled: true },
    lsn: "0/00000022",
  },

  // ── Scenario: stub from child → upgraded later (different parent) ────
  // task points to a project that doesn't exist yet
  {
    kind: "insert",
    table: "tasks",
    row: {
      id: "r-ta-4",
      project_id: "r-pr-future",
      engagement_id: "r-eng-1",
      title: "Future-project task",
      status: "open",
    },
    lsn: "0/00000023",
  },
  // real project arrives — upgrades the stub
  {
    kind: "insert",
    table: "projects",
    row: {
      id: "r-pr-future",
      engagement_id: "r-eng-1",
      name: "Future Project",
      status: "active",
      start_date: "2026-03-01",
    },
    lsn: "0/00000024",
  },

  // ── Scenario: more interactions & updates for variety ────────────────
  {
    kind: "insert",
    table: "interactions",
    row: {
      id: "r-int-3",
      engagement_id: "r-eng-3",
      type: "meeting",
      content: "Beta migration scoping",
      scheduled_at: "2026-02-12T15:00:00Z",
    },
    lsn: "0/00000025",
  },
  {
    kind: "insert",
    table: "interactions",
    row: {
      id: "r-int-4",
      engagement_id: "r-eng-2",
      type: "call",
      content: "Renewal discussion",
      scheduled_at: "2026-03-05T11:00:00Z",
    },
    lsn: "0/00000026",
  },

  // ── Scenario: deletes (≥3, plus one delete of non-existent node) ──────
  // Delete an existing interaction.
  {
    kind: "delete",
    table: "interactions",
    row: {},
    oldKeys: { id: "r-int-3" },
    lsn: "0/00000027",
  },
  // Delete an existing expense.
  {
    kind: "delete",
    table: "expenses",
    row: {},
    oldKeys: { id: "r-ex-2" },
    lsn: "0/00000028",
  },
  // Delete a calendar_event.
  {
    kind: "delete",
    table: "calendar_events",
    row: {},
    oldKeys: { id: "r-ce-3" },
    lsn: "0/00000029",
  },
  // Delete a node that never existed — graceful noop.
  {
    kind: "delete",
    table: "contacts",
    row: {},
    oldKeys: { id: "r-ct-never-existed" },
    lsn: "0/0000002A",
  },

  // ── Scenario: more tasks for variety ─────────────────────────────────
  {
    kind: "insert",
    table: "tasks",
    row: {
      id: "r-ta-5",
      project_id: "r-pr-2",
      engagement_id: "r-eng-3",
      title: "Schema review",
      status: "done",
      due_date: "2026-02-19",
    },
    lsn: "0/0000002B",
  },
  {
    kind: "update",
    table: "tasks",
    row: {
      id: "r-ta-2",
      project_id: "r-pr-2",
      engagement_id: "r-eng-3",
      title: "Migration plan draft",
      status: "done", // moved in_progress → done
      due_date: "2026-02-20",
    },
    lsn: "0/0000002C",
  },

  // ── Scenario: extra companies/contacts to round out ──────────────────
  {
    kind: "insert",
    table: "companies",
    row: { id: "r-co-3", name: "Gamma Tech", industry: "AI" },
    lsn: "0/0000002D",
  },
  {
    kind: "insert",
    table: "contacts",
    row: {
      id: "r-ct-4",
      company_id: "r-co-3",
      name: "Dave Gamma",
      email: "dave@gamma.example",
      role: "Founder",
    },
    lsn: "0/0000002E",
  },
  {
    kind: "update",
    table: "companies",
    row: { id: "r-co-3", name: "Gamma Tech Inc.", industry: "AI Infrastructure" },
    lsn: "0/0000002F",
  },

  // ── Scenario: invoice update with delete in middle ───────────────────
  {
    kind: "insert",
    table: "invoices",
    row: {
      id: "r-in-3",
      engagement_id: "r-eng-3",
      invoice_number: "INV-003",
      amount: 5000,
      status: "draft",
      client_name: "Beta Industries",
      issued_date: "2026-02-20",
      due_date: "2026-03-20",
    },
    lsn: "0/00000030",
  },
  {
    kind: "delete",
    table: "invoices",
    row: {},
    oldKeys: { id: "r-in-3" },
    lsn: "0/00000031",
  },

  // ── Scenario: final partner ──────────────────────────────────────────
  {
    kind: "insert",
    table: "partners",
    row: {
      id: "r-pa-3",
      name: "Delta Solutions",
      website: "https://delta.example",
      stage: "active",
      email: "contact@delta.example",
    },
    lsn: "0/00000032",
  },
];
