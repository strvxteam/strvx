import "server-only";

/**
 * Post-gbrain shim. SIT no longer drives Neo4j or pgvector directly — the
 * markdown brain at /brain/ is the source of truth and `brain-reader.ts`
 * is the only consumer. These helpers exist so call sites that still expect
 * a `kgDeps`-shaped object (the MCP route, brief generation) compile and
 * pass through a tiny actor descriptor.
 */

export interface KgDeps {
  actor: string;
}

export function kgDeps(actorId: string): KgDeps {
  return { actor: actorId };
}
