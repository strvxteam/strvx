import type { Provenance } from "../types";
import { extractProvenance, type ReadDeps } from "./get-node";
import { writeAuditEntry } from "../audit/writer";
import { assertRole } from "../auth/middleware";

export async function getProvenance(
  deps: ReadDeps,
  id: string,
): Promise<Provenance | null> {
  assertRole(deps.ctx, "reader");
  const start = Date.now();
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN properties(n) AS p LIMIT 1", { id });
      if (r.records.length === 0) {
        const r2 = await tx.run(
          "MATCH ()-[r {id: $id}]->() RETURN properties(r) AS p LIMIT 1",
          { id },
        );
        if (r2.records.length === 0) return null;
        return extractProvenance(r2.records[0].get("p") as Record<string, unknown>);
      }
      return extractProvenance(r.records[0].get("p") as Record<string, unknown>);
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getProvenance",
      targetNodeId: id,
      parameters: { id },
      resultSummary: { found: result !== null },
      latencyMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getProvenance",
      targetNodeId: id,
      parameters: { id },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
