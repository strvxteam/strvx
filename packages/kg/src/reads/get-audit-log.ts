import type { PostgresClient } from "../client/postgres.js";
import { assertRole } from "../auth/middleware.js";
import type { AgentContext } from "../types.js";

export interface AuditQueryOpts {
  since?: Date;
  limit?: number;
}

export interface AuditEntryRow {
  id: string;
  occurredAt: Date;
  actorKind: string;
  actorId: string;
  tool: string;
  targetNodeId: string | null;
  targetEdgeId: string | null;
  parameters: Record<string, unknown> | null;
  resultSummary: Record<string, unknown> | null;
  latencyMs: number | null;
  success: boolean;
  errorMessage: string | null;
}

export async function getAuditLog(
  deps: { sql: PostgresClient; ctx: AgentContext },
  targetId: string,
  opts: AuditQueryOpts = {},
): Promise<AuditEntryRow[]> {
  assertRole(deps.ctx, "reader");
  const limit = opts.limit ?? 100;
  const since = opts.since ?? new Date(0);
  const rows = await deps.sql<
    Array<{
      id: string;
      occurred_at: Date;
      actor_kind: string;
      actor_id: string;
      tool: string;
      target_node_id: string | null;
      target_edge_id: string | null;
      parameters: Record<string, unknown> | null;
      result_summary: Record<string, unknown> | null;
      latency_ms: number | null;
      success: boolean;
      error_message: string | null;
    }>
  >`
    SELECT id::text, occurred_at, actor_kind, actor_id, tool, target_node_id, target_edge_id,
           parameters, result_summary, latency_ms, success, error_message
    FROM kg_audit_log
    WHERE (target_node_id = ${targetId} OR target_edge_id = ${targetId})
      AND occurred_at >= ${since}
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    actorKind: r.actor_kind,
    actorId: r.actor_id,
    tool: r.tool,
    targetNodeId: r.target_node_id,
    targetEdgeId: r.target_edge_id,
    parameters: r.parameters,
    resultSummary: r.result_summary,
    latencyMs: r.latency_ms,
    success: r.success,
    errorMessage: r.error_message,
  }));
}
