import { describe, expect, it } from "vitest";
import {
  POSTGRES_MAPPINGS,
  applyMapping,
  idFor,
  mappingFor,
} from "../../src/mappings/postgres.js";

describe("POSTGRES_MAPPINGS", () => {
  const expected = [
    "companies",
    "contacts",
    "engagements",
    "interactions",
    "partners",
    "projects",
    "tasks",
    "invoices",
    "expenses",
    "calendar_events",
  ];

  it("covers all 10 v1 tables", () => {
    for (const t of expected) {
      expect(POSTGRES_MAPPINGS[t]).toBeDefined();
    }
    expect(Object.keys(POSTGRES_MAPPINGS).sort()).toEqual(expected.slice().sort());
  });

  it("every relationship targets a mapped table", () => {
    for (const m of Object.values(POSTGRES_MAPPINGS)) {
      for (const rel of m.relationships) {
        expect(
          POSTGRES_MAPPINGS[rel.targetTable],
          `relationship to ${rel.targetTable}`,
        ).toBeDefined();
      }
    }
  });

  it("every mapping declares a primary key and entityType", () => {
    for (const m of Object.values(POSTGRES_MAPPINGS)) {
      expect(m.primaryKey).toBeTruthy();
      expect(m.entityType).toBeTruthy();
    }
  });
});

describe("applyMapping", () => {
  it("maps a companies row to an Organization with no edges", () => {
    const m = mappingFor("companies");
    const out = applyMapping(m, {
      id: "co-1",
      name: "Acme Corp",
      industry: "SaaS",
      created_at: "2026-01-01",
    });
    expect(out).not.toBeNull();
    expect(out?.nodeId).toBe("postgres:companies:co-1");
    expect(out?.entityType).toBe("Organization");
    expect(out?.properties.name).toBe("Acme Corp");
    expect(out?.properties.industry).toBe("SaaS");
    expect(out?.edges).toEqual([]);
  });

  it("maps a contacts row to a Person with WORKS_AT edge outgoing", () => {
    const m = mappingFor("contacts");
    const out = applyMapping(m, {
      id: "ct-1",
      company_id: "co-1",
      name: "Ada Lovelace",
      email: "ADA@ACME.COM",
      phone: "+1-555-0100",
      role: "Engineer",
      created_at: "2026-01-02",
    });
    expect(out).not.toBeNull();
    expect(out?.nodeId).toBe("postgres:contacts:ct-1");
    expect(out?.entityType).toBe("Person");
    expect(out?.properties.email).toBe("ada@acme.com"); // lowercased
    expect(out?.properties.role).toBe("Engineer");
    expect(out?.edges).toHaveLength(1);
    expect(out?.edges[0].type).toBe("WORKS_AT");
    expect(out?.edges[0].from).toBe("postgres:contacts:ct-1");
    expect(out?.edges[0].to).toBe("postgres:companies:co-1");
  });

  it("maps an engagements row with incoming HAS_ENGAGEMENT (company → engagement)", () => {
    const m = mappingFor("engagements");
    const out = applyMapping(m, {
      id: "eng-1",
      company_id: "co-1",
      name: "Pilot",
      stage: "qualified",
      deal_value: 5000,
      stage_entered_at: "2026-01-03",
      created_at: "2026-01-02",
    });
    expect(out?.edges).toHaveLength(1);
    expect(out?.edges[0].type).toBe("HAS_ENGAGEMENT");
    // direction='in' on engagements means company → engagement
    expect(out?.edges[0].from).toBe("postgres:companies:co-1");
    expect(out?.edges[0].to).toBe("postgres:engagements:eng-1");
    // deal_value mapped as 'value'
    expect(out?.properties.value).toBe(5000);
  });

  it("maps an interactions row with ABOUT edge to engagement", () => {
    const m = mappingFor("interactions");
    const out = applyMapping(m, {
      id: "int-1",
      engagement_id: "eng-1",
      type: "meeting",
      content: "Discovery call notes",
      scheduled_at: "2026-02-01T10:00:00Z",
      created_at: "2026-02-01",
    });
    expect(out?.entityType).toBe("Interaction");
    expect(out?.properties.content).toBe("Discovery call notes");
    expect(out?.edges).toHaveLength(1);
    expect(out?.edges[0].type).toBe("ABOUT");
    expect(out?.edges[0].from).toBe("postgres:interactions:int-1");
    expect(out?.edges[0].to).toBe("postgres:engagements:eng-1");
  });

  it("maps a tasks row with edges to both project and engagement", () => {
    const m = mappingFor("tasks");
    const out = applyMapping(m, {
      id: "task-1",
      project_id: "proj-1",
      engagement_id: "eng-1",
      title: "Build homepage",
      status: "todo",
      due_date: "2026-03-01",
      created_at: "2026-01-10",
    });
    expect(out?.entityType).toBe("Task");
    expect(out?.properties.due_at).toBe("2026-03-01"); // due_date mapped as due_at
    expect(out?.edges).toHaveLength(2);
    const types = out?.edges.map((e) => e.type);
    expect(types).toContain("ABOUT");
  });

  it("maps an invoices row with ABOUT edge to engagement and column aliases", () => {
    const m = mappingFor("invoices");
    const out = applyMapping(m, {
      id: "inv-1",
      engagement_id: "eng-1",
      invoice_number: "INV-001",
      amount: "1500.00",
      status: "sent",
      client_name: "Acme Corp",
      issued_date: "2026-02-01",
      due_date: "2026-02-15",
      paid_date: null,
    });
    expect(out?.entityType).toBe("FinancialEvent");
    expect(out?.properties.issued_at).toBe("2026-02-01"); // issued_date → issued_at
    expect(out?.properties.due_at).toBe("2026-02-15");
    // paid_date is null — should be skipped (null check)
    expect(out?.edges).toHaveLength(1);
    expect(out?.edges[0].type).toBe("ABOUT");
  });

  it("maps a calendar_events row with edges to engagement and project", () => {
    const m = mappingFor("calendar_events");
    const out = applyMapping(m, {
      id: "cal-1",
      engagement_id: "eng-1",
      project_id: "proj-1",
      title: "Kickoff Call",
      date: "2026-03-15",
      type: "meeting",
      zoom_link: "https://zoom.us/j/123",
    });
    expect(out?.entityType).toBe("Communication");
    expect(out?.properties.meeting_url).toBe("https://zoom.us/j/123"); // zoom_link → meeting_url
    expect(out?.edges).toHaveLength(2);
    expect(out?.edges.map((e) => e.type)).toEqual(["ABOUT", "ABOUT"]);
  });

  it("skips edges whose FK is null", () => {
    const m = mappingFor("contacts");
    // company_id is not nullable in schema, but CDC rows can omit fields
    const out = applyMapping(m, { id: "ct-2", name: "Orphan", company_id: null });
    expect(out?.edges).toEqual([]);
  });

  it("skips properties that are undefined in the row", () => {
    const m = mappingFor("companies");
    const out = applyMapping(m, { id: "co-2", name: "Minimal Co" });
    expect(out?.properties.name).toBe("Minimal Co");
    expect(out?.properties.industry).toBeUndefined();
  });

  it("returns null when the row is missing the primary key", () => {
    const m = mappingFor("companies");
    expect(applyMapping(m, { name: "no id" })).toBeNull();
  });

  it("idFor produces the stable shape", () => {
    expect(idFor("postgres", "companies", "abc")).toBe("postgres:companies:abc");
  });

  it("mappingFor throws on unknown table", () => {
    expect(() => mappingFor("nope")).toThrow(/no mapping/);
  });
});
