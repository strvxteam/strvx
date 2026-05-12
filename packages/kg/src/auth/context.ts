import type { AgentContext, Role } from "../types.js";

export type { AgentContext, Role };

/**
 * Package already-verified agent claims into an `AgentContext`.
 *
 * **This function does NOT validate the API key or claims.** The caller is
 * expected to have already authenticated against `agent_credentials` and
 * extracted the claims; this is a typed packaging step only. Pulls
 * `sessionId` from the optional `x-kg-session-id` header.
 */
export function buildAgentContext(
  headers: Headers,
  claims: { agentId: string; role: Role; scopeEntityTypes?: string[]; scopeOperations?: string[] },
): AgentContext {
  return {
    actorKind: "agent",
    actorId: claims.agentId,
    role: claims.role,
    scopeEntityTypes: claims.scopeEntityTypes as AgentContext["scopeEntityTypes"],
    scopeOperations: claims.scopeOperations,
    sessionId: headers.get("x-kg-session-id") ?? undefined,
  };
}

/**
 * @deprecated Renamed to `buildAgentContext` — the old name implied this
 * function verifies headers, which it does not. The new name reflects the
 * actual behavior (typed packaging of pre-verified claims). Will be removed
 * before v1.0.
 */
export const callerFromHeaders = buildAgentContext;
