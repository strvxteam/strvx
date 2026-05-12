import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import type { AgentContext } from "../types.js";
import { assertReadOnly } from "./validate.js";

export interface RunCypherDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export interface CypherResult {
  records: Record<string, unknown>[];
  recordCount: number;
}

export async function runCypher(
  deps: RunCypherDeps,
  query: string,
  params: Record<string, unknown>,
): Promise<CypherResult> {
  const start = Date.now();
  assertRole(deps.ctx, "reader");
  try {
    assertReadOnly(query);
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "runCypher",
      parameters: { query, params },
      success: false,
      errorMessage: (err as Error).message,
      latencyMs: Date.now() - start,
    });
    throw err;
  }
  try {
    const records = await deps.client.read(async (tx) => {
      const r = await tx.run(query, params);
      return r.records.map((rec) =>
        Object.fromEntries(rec.keys.map((k) => [String(k), rec.get(k)])),
      );
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "runCypher",
      parameters: { query, params },
      resultSummary: { recordCount: records.length },
      latencyMs: Date.now() - start,
      success: true,
    });
    return { records, recordCount: records.length };
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "runCypher",
      parameters: { query, params },
      success: false,
      errorMessage: (err as Error).message,
      latencyMs: Date.now() - start,
    });
    throw err;
  }
}
