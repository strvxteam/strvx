import { db } from "./db";
import { auditLogs } from "./db/schema";

interface AuditEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Fire-and-forget — never throws to avoid
 * disrupting the parent operation.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
