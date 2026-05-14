import type { PostgresClient } from "../client/postgres";

export interface AuditEntry {
  actorKind: "agent" | "user" | "system";
  actorId: string;
  tool: string;
  targetNodeId?: string;
  targetEdgeId?: string;
  parameters?: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  latencyMs?: number;
  success: boolean;
  errorMessage?: string;
}

export async function writeAuditEntry(
  sql: PostgresClient,
  entry: AuditEntry,
): Promise<void> {
  await sql`
    INSERT INTO kg_audit_log (
      actor_kind, actor_id, tool, target_node_id, target_edge_id,
      parameters, result_summary, latency_ms, success, error_message
    ) VALUES (
      ${entry.actorKind}, ${entry.actorId}, ${entry.tool},
      ${entry.targetNodeId ?? null}, ${entry.targetEdgeId ?? null},
      ${entry.parameters ? sql.json(entry.parameters as Parameters<typeof sql.json>[0]) : null},
      ${entry.resultSummary ? sql.json(entry.resultSummary as Parameters<typeof sql.json>[0]) : null},
      ${entry.latencyMs ?? null}, ${entry.success}, ${entry.errorMessage ?? null}
    )
  `;
}
