import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNeo4j, startPostgres, type KgTestEnv } from "@strvx/kg/testing";

describe("test harness", () => {
  let env: KgTestEnv;

  beforeAll(async () => {
    env = { neo4j: await startNeo4j(), postgres: await startPostgres() };
  }, 120_000);

  afterAll(async () => {
    await env.neo4j.stop();
    await env.postgres.stop();
  });

  it("starts a Neo4j container and accepts a Cypher query", async () => {
    const session = env.neo4j.driver.session();
    try {
      const result = await session.run("RETURN 1 AS one");
      expect(result.records[0].get("one").toNumber()).toBe(1);
    } finally {
      await session.close();
    }
  });

  it("starts a Postgres container with vector extension and accepts SQL", async () => {
    const rows = await env.postgres.sql`SELECT 1 AS one`;
    expect(rows[0].one).toBe(1);
    const ext = await env.postgres.sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    expect(ext[0]?.extname).toBe("vector");
  });
});
