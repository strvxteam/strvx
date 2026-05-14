import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j } from "@strvx/kg/testing";
import { createReadOnlyUser, startNeo4j } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";

describe("read-only Neo4j user enforcement (defense-in-depth)", () => {
  let n4j: StartedNeo4j;
  let client: Neo4jClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    const ro = await createReadOnlyUser(n4j);
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro,
    });
  }, 180_000);

  afterAll(async () => {
    if (client) await client.close();
    if (n4j) await n4j.stop();
  });

  it("RO user can read", async () => {
    const result = await client.read(async (tx) => {
      const r = await tx.run("RETURN 1 AS one");
      return r.records[0].get("one") as number;
    });
    expect(result).toBe(1);
  });

  it("RO user cannot write even when the validator is bypassed", async () => {
    // Open a raw RO session and skip assertReadOnly entirely — this simulates
    // a validator bypass and proves the DB itself is the final enforcement layer.
    const session = client.unsafeRawSession("read");
    try {
      const promise = session.run("CREATE (n:Test {id: 'leak'}) RETURN n");
      await expect(promise).rejects.toSatisfy((err: unknown) => {
        const e = err as { message?: string; code?: string };
        const msg = (e.message ?? "").toLowerCase();
        const code = (e.code ?? "").toLowerCase();
        // Log the actual error for diagnostics if the test fails
        if (
          !msg.match(/permission|forbidden|unauthorized|access mode|write/i) &&
          !code.match(/forbidden|security|write/i)
        ) {
          console.error("Unexpected error from Neo4j (adjust regex if needed):", err);
          return false;
        }
        return true;
      });
    } finally {
      await session.close();
    }
  });

  it("RW user can still write", async () => {
    const result = await client.unsafeWrite(async (tx) => {
      const r = await tx.run("CREATE (n:Test {id: 'ok'}) RETURN n.id AS id");
      return r.records[0].get("id") as string;
    });
    expect(result).toBe("ok");
  });
});
