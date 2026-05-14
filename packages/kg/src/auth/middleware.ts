import type { AgentContext, EntityType, Role } from "../types";

export class KgAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KgAuthError";
  }
}

const ROLE_RANK: Record<Role, number> = { reader: 0, writer: 1, admin: 2 };

export function assertRole(ctx: AgentContext, minRole: Role): void {
  const actorRank = ROLE_RANK[ctx.role];
  if (actorRank === undefined) {
    // Unknown role string slipped past the type system (e.g., from external
    // claims). Reject explicitly instead of silently treating as 'reader'.
    throw new KgAuthError(
      `actor ${ctx.actorId} has unknown role '${ctx.role}'`,
    );
  }
  if (actorRank < ROLE_RANK[minRole]) {
    throw new KgAuthError(
      `actor ${ctx.actorId} has role '${ctx.role}', needs at least '${minRole}'`,
    );
  }
}

export function assertWriteScope(
  ctx: AgentContext,
  entityType: EntityType,
  operation: string,
): void {
  assertRole(ctx, "writer");
  if (ctx.scopeEntityTypes && !ctx.scopeEntityTypes.includes(entityType)) {
    throw new KgAuthError(
      `actor ${ctx.actorId} is not scoped to write ${entityType}`,
    );
  }
  if (ctx.scopeOperations && !ctx.scopeOperations.includes(operation)) {
    throw new KgAuthError(
      `actor ${ctx.actorId} is not scoped for operation '${operation}'`,
    );
  }
}
