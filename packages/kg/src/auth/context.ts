import type { AgentContext, Role } from "../types.js";

export type { AgentContext, Role };

/**
 * Build an AgentContext from request headers. Caller is expected to have already
 * verified the API key against agent_credentials; this just packages the claims.
 */
export function callerFromHeaders(
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
