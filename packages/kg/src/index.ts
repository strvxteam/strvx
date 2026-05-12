// Types
export * from "./types.js";

// Clients (consumers usually don't import directly; exposed for advanced use)
export { createNeo4jClient } from "./client/neo4j.js";
export type { Neo4jClient, Neo4jClientOptions } from "./client/neo4j.js";
export { createPostgresClient } from "./client/postgres.js";
export type { PostgresClient } from "./client/postgres.js";

// Auth
export { callerFromHeaders } from "./auth/context.js";
export { assertRole, assertWriteScope, KgAuthError } from "./auth/middleware.js";

// Provenance
export {
  buildProvenance,
  computeTrustScore,
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_SOURCE_RELIABILITY,
} from "./provenance/compute.js";

// Audit
export { writeAuditEntry } from "./audit/writer.js";
export type { AuditEntry } from "./audit/writer.js";

// Cypher (read-only escape)
export { runCypher } from "./cypher/run.js";
export type { CypherResult, RunCypherDeps } from "./cypher/run.js";
export { assertReadOnly, CypherWriteAttemptError } from "./cypher/validate.js";

// Embedding
export { createOpenAIEmbeddingProvider } from "./embedding/openai.js";
export { createMockEmbeddingProvider } from "./embedding/mock.js";
export type { EmbeddingProvider } from "./embedding/provider.js";

// Reads
export { getNode, getEdge } from "./reads/get-node.js";
export type { ReadDeps } from "./reads/get-node.js";
export { getProvenance } from "./reads/get-provenance.js";
export { findEntities } from "./reads/find-entities.js";
export type {
  SearchResult,
  FindEntitiesOptions,
  FindEntitiesDeps,
} from "./reads/find-entities.js";
export { findSimilar } from "./reads/find-similar.js";
export type {
  SimilarEntity,
  FindSimilarOptions,
  FindSimilarDeps,
} from "./reads/find-similar.js";
export { getEntityContext } from "./reads/get-entity-context.js";
export type {
  EntityContext,
  GetEntityContextOptions,
} from "./reads/get-entity-context.js";
export { traverse } from "./reads/traverse.js";
export type {
  TraversalPattern,
  TraversalResult,
} from "./reads/traverse.js";
export { getAuditLog } from "./reads/get-audit-log.js";
export type {
  AuditEntryRow,
  AuditQueryOpts,
} from "./reads/get-audit-log.js";
