import { Neo4jContainer, type StartedNeo4jContainer } from "@testcontainers/neo4j";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import neo4j, { type Driver as Neo4jDriver } from "neo4j-driver";
import postgres, { type Sql } from "postgres";

export type StartedNeo4j = {
  container: StartedNeo4jContainer;
  driver: Neo4jDriver;
  stop: () => Promise<void>;
};

export type StartedPostgres = {
  container: StartedPostgreSqlContainer;
  url: string;
  sql: Sql;
  stop: () => Promise<void>;
};

export type KgTestEnv = { neo4j: StartedNeo4j; postgres: StartedPostgres };

export async function startNeo4j(): Promise<StartedNeo4j> {
  const container = await new Neo4jContainer("neo4j:5.25-enterprise")
    .withEnvironment({ NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes" })
    .withApoc()
    .start();
  const driver = neo4j.driver(
    container.getBoltUri(),
    neo4j.auth.basic(container.getUsername(), container.getPassword()),
  );
  return {
    container,
    driver,
    stop: async () => {
      await driver.close();
      await container.stop();
    },
  };
}

export async function startPostgres(): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = container.getConnectionUri();
  const sql = postgres(url, { prepare: false, max: 5 });
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  return {
    container,
    url,
    sql,
    stop: async () => {
      await sql.end();
      await container.stop();
    },
  };
}

/**
 * Create a `kg_test_ro` user in the Neo4j system database with the built-in
 * `reader` role (read-only). Used by integration tests to verify that the
 * defense-in-depth claim — "Neo4j RO user can't write even if the validator
 * is bypassed" — holds against a real DB.
 *
 * Requires Neo4j Enterprise (community doesn't support multiple users).
 */
export async function createReadOnlyUser(
  n4j: StartedNeo4j,
  username = "kg_test_ro",
  password = "kg_test_ro_password",
): Promise<{ user: string; password: string }> {
  const systemSession = n4j.driver.session({ database: "system" });
  try {
    // Drop if exists, recreate. Idempotent for re-runs.
    await systemSession.run(`DROP USER ${username} IF EXISTS`);
    await systemSession.run(
      `CREATE USER ${username} SET PASSWORD $password SET PASSWORD CHANGE NOT REQUIRED`,
      { password },
    );
    await systemSession.run(`GRANT ROLE reader TO ${username}`);
  } finally {
    await systemSession.close();
  }
  return { user: username, password };
}
