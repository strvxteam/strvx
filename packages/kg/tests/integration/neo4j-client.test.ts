import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j } from "@strvx/kg/testing";
import { startNeo4j } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";

describe("Neo4jClient", () => {
  let n4j: StartedNeo4j;
  let client: Neo4jClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await n4j.stop();
  });

  it("executes a read query via the read-only session", async () => {
    const result = await client.read(async (tx) => {
      const r = await tx.run("RETURN 1 AS one");
      return r.records[0].get("one") as number;
    });
    expect(result).toBe(1);
  });

  it("executes a write query via the read-write session", async () => {
    const result = await client.unsafeWrite(async (tx) => {
      const r = await tx.run("CREATE (n:Test {id: 'x'}) RETURN n.id AS id");
      return r.records[0].get("id");
    });
    expect(result).toBe("x");
  });

  it("rejects writes attempted through the read-only session", async () => {
    await expect(
      client.read(async (tx) => {
        await tx.run("CREATE (n:Test {id: 'should-fail'}) RETURN n");
      }),
    ).rejects.toThrow();
  });
});
