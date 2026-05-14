import type {
  MappedEdge,
  MappedRow,
  PostgresMappings,
  PropertyMapping,
  TableMapping,
} from "./types";

/**
 * Mapping config from strvx Postgres tables → graph entities and edges.
 *
 * Add a new table → graph entity by adding an entry here. The golden test in
 * `tests/unit/mappings.test.ts` will catch drift.
 *
 * Column names are verified against packages/db/src/schema.ts — only columns
 * that actually exist are listed. Columns from the original spec that were
 * absent in the schema are noted with TODO comments.
 */
export const POSTGRES_MAPPINGS: PostgresMappings = {
  companies: {
    table: "companies",
    entityType: "Organization",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "name" },
      { column: "industry" },
      { column: "created_at" },
      // TODO: add domain when schema gains a domain column
    ],
    relationships: [],
  },

  contacts: {
    table: "contacts",
    entityType: "Person",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "name" },
      { column: "email", transform: "lowercase" },
      { column: "phone" },
      { column: "role" }, // schema has 'role', not 'title'
      { column: "linkedin_url" },
      { column: "created_at" },
    ],
    relationships: [
      {
        fkColumn: "company_id",
        targetTable: "companies",
        type: "WORKS_AT",
        direction: "out",
      },
    ],
  },

  engagements: {
    table: "engagements",
    entityType: "Engagement",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "name" },
      { column: "stage" },
      { column: "deal_value", as: "value" }, // schema: deal_value, not value
      { column: "stage_entered_at" }, // schema: stage_entered_at, not stage_changed_at
      { column: "created_at" },
    ],
    relationships: [
      {
        fkColumn: "company_id",
        targetTable: "companies",
        type: "HAS_ENGAGEMENT",
        direction: "in",
      },
    ],
  },

  interactions: {
    table: "interactions",
    entityType: "Interaction",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "type" },
      { column: "content" }, // schema has 'content', not 'subject'/'summary'
      { column: "scheduled_at" }, // schema: scheduled_at, not occurred_at
      { column: "created_at" },
    ],
    relationships: [
      {
        fkColumn: "engagement_id",
        targetTable: "engagements",
        type: "ABOUT",
        direction: "out",
      },
      // TODO: add contact-side edge when schema gains a contact_id FK on interactions
      // schema only has author_id → users, which is not a mapped table
    ],
  },

  partners: {
    table: "partners",
    entityType: "Organization",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "name" },
      { column: "website" }, // schema has 'website', not 'domain'
      { column: "stage" },
      { column: "email", transform: "lowercase" },
      { column: "created_at" },
    ],
    relationships: [],
  },

  projects: {
    table: "projects",
    entityType: "Engagement",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "name" },
      { column: "status" },
      { column: "start_date", as: "started_at" }, // schema: start_date, not started_at
      { column: "end_date", as: "completed_at" }, // schema: end_date, not completed_at
    ],
    relationships: [
      {
        fkColumn: "engagement_id",
        targetTable: "engagements",
        type: "ABOUT",
        direction: "out",
      },
      // TODO: add company edge when schema gains a company_id FK on projects
      // currently projects link to engagements, not directly to companies
    ],
  },

  tasks: {
    table: "tasks",
    entityType: "Task",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "title" },
      { column: "status" },
      { column: "due_date", as: "due_at" }, // schema: due_date, not due_at
      { column: "created_at" },
    ],
    relationships: [
      {
        fkColumn: "project_id",
        targetTable: "projects",
        type: "ABOUT",
        direction: "out",
      },
      {
        fkColumn: "engagement_id",
        targetTable: "engagements",
        type: "ABOUT",
        direction: "out",
      },
    ],
  },

  invoices: {
    table: "invoices",
    entityType: "FinancialEvent",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "invoice_number" },
      { column: "amount" },
      { column: "status" },
      { column: "client_name" },
      { column: "issued_date", as: "issued_at" }, // schema: issued_date, not issued_at
      { column: "due_date", as: "due_at" },       // schema: due_date
      { column: "paid_date", as: "paid_at" },     // schema: paid_date, not paid_at
      // TODO: currency not in schema; add when schema gains it
    ],
    relationships: [
      {
        fkColumn: "engagement_id",
        targetTable: "engagements",
        type: "ABOUT",
        direction: "out",
      },
      // TODO: add company-level PAID_BY when schema gains company_id on invoices
      // current schema only has engagement_id
    ],
  },

  expenses: {
    table: "expenses",
    entityType: "FinancialEvent",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "description" },
      { column: "amount" },
      { column: "category" },
      { column: "vendor" },
      { column: "date", as: "occurred_at" }, // schema: date, not occurred_at
      { column: "created_at" },
      // TODO: currency not in schema; add when schema gains it
      // TODO: company_id not in schema; add PAID_TO edge when it exists
    ],
    relationships: [],
  },

  email_threads: {
    table: "email_threads",
    entityType: "Interaction",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "subject" },
      { column: "message_count" },
      { column: "last_message_at" },
      { column: "agent_state" },
      { column: "agent_category" },
      { column: "agent_urgency" },
      { column: "created_at" },
    ],
    relationships: [
      { fkColumn: "engagement_id", targetTable: "engagements", type: "ABOUT", direction: "out" },
      { fkColumn: "contact_id", targetTable: "contacts", type: "INVOLVED_IN", direction: "out" },
      { fkColumn: "company_id", targetTable: "companies", type: "INVOLVED_IN", direction: "out" },
    ],
  },

  email_messages: {
    table: "email_messages",
    entityType: "Interaction",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "subject" },
      { column: "from_email", transform: "lowercase" },
      { column: "snippet" },
      { column: "direction" },
      { column: "sent_at" },
      { column: "is_unread" },
    ],
    relationships: [
      { fkColumn: "thread_id", targetTable: "email_threads", type: "REFERENCES", direction: "out" },
    ],
  },

  bookings: {
    table: "bookings",
    entityType: "Interaction",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "client_name" },
      { column: "service_type" },
      { column: "meeting_type" },
      { column: "start_time" },
      { column: "duration_minutes" },
      { column: "status" },
      { column: "notes" },
      { column: "notes_summary" },
      { column: "created_at" },
    ],
    relationships: [
      { fkColumn: "engagement_id", targetTable: "engagements", type: "ABOUT", direction: "out" },
    ],
  },

  meeting_prep_briefs: {
    table: "meeting_prep_briefs",
    entityType: "Interaction",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "content_markdown" },
      { column: "generated_at" },
    ],
    relationships: [
      { fkColumn: "engagement_id", targetTable: "engagements", type: "ABOUT", direction: "out" },
    ],
  },

  next_actions: {
    table: "next_actions",
    entityType: "Task",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "description" },
      { column: "priority" },
      { column: "due_date" },
      { column: "completed" },
      { column: "created_at" },
    ],
    relationships: [
      { fkColumn: "engagement_id", targetTable: "engagements", type: "ABOUT", direction: "out" },
    ],
  },

  calendar_events: {
    table: "calendar_events",
    entityType: "Communication",
    primaryKey: "id",
    sourceType: "postgres",
    properties: [
      { column: "title" },
      { column: "date" },
      { column: "type" },
      { column: "zoom_link", as: "meeting_url" }, // schema: zoom_link, not meeting_url
      // TODO: starts_at/ends_at not in schema; schema uses date+start_hour+duration_hours
    ],
    relationships: [
      {
        fkColumn: "engagement_id",
        targetTable: "engagements",
        type: "ABOUT",
        direction: "out",
      },
      {
        fkColumn: "project_id",
        targetTable: "projects",
        type: "ABOUT",
        direction: "out",
      },
      // TODO: add contact-side INVOLVED_IN when schema gains contact_id on calendar_events
    ],
  },
};

// ── Interpreter helpers ─────────────────────────────────────────────────

/**
 * Apply a TableMapping to a row from a CDC insert/update event, producing
 * the node + edges to upsert. Returns `null` if `row` is missing the
 * primary key (malformed event).
 */
export function applyMapping(
  mapping: TableMapping,
  row: Record<string, unknown>,
): MappedRow | null {
  const pkValue = row[mapping.primaryKey];
  if (pkValue === undefined || pkValue === null) return null;
  const pk = String(pkValue);

  const properties: Record<string, unknown> = {};
  for (const prop of mapping.properties) {
    const v = row[prop.column];
    if (v === undefined) continue;
    const key = prop.as ?? prop.column;
    properties[key] = applyTransform(v, prop);
  }

  const nodeId = idFor(mapping.sourceType, mapping.table, pk);
  const edges: MappedEdge[] = [];
  for (const rel of mapping.relationships) {
    const targetMapping = POSTGRES_MAPPINGS[rel.targetTable];
    if (!targetMapping) continue; // unmapped target — skip
    const target = row[rel.fkColumn];
    if (target === undefined || target === null) continue;
    const targetId = idFor(targetMapping.sourceType, rel.targetTable, String(target));
    const edgeId = idFor(mapping.sourceType, mapping.table, `${pk}:${rel.fkColumn}`);
    edges.push({
      edgeId,
      type: rel.type,
      from: rel.direction === "out" ? nodeId : targetId,
      to: rel.direction === "out" ? targetId : nodeId,
    });
  }

  return {
    nodeId,
    entityType: mapping.entityType,
    properties,
    edges,
  };
}

/**
 * Stable graph id for a Postgres-derived entity.
 */
export function idFor(sourceType: string, table: string, pk: string): string {
  return `${sourceType}:${table}:${pk}`;
}

function applyTransform(v: unknown, prop: PropertyMapping): unknown {
  if (typeof v !== "string") return v;
  if (prop.transform === "lowercase") return v.toLowerCase();
  if (prop.transform === "uppercase") return v.toUpperCase();
  if (prop.transform === "trim") return v.trim();
  return v;
}

/**
 * Look up a mapping by table. Throws if unknown — caller passes a parsed
 * CDC event whose .table is one of the publication's listed tables.
 */
export function mappingFor(table: string): TableMapping {
  const m = POSTGRES_MAPPINGS[table];
  if (!m) throw new Error(`no mapping for table '${table}'`);
  return m;
}
