// Types
export * from "./types";

// Clients (consumers usually don't import directly; exposed for advanced use)
/**
 * Construct a raw Neo4j client wrapping read-write and read-only drivers.
 *
 * **Direct use of this factory outside `packages/kg` is forbidden** — the curated
 * read/write functions (`getNode`, `findEntities`, `recordObservation`, etc.) are
 * the only safe surface. The returned client exposes `unsafeWrite` and
 * `unsafeRawSession` which BYPASS audit, auth, provenance, and conflict detection.
 * The `kg/no-neo4j-outside-kg` ESLint rule blocks consumers from importing this
 * factory; do not work around it.
 */
export { createNeo4jClient } from "./client/neo4j";
export type { Neo4jClient, Neo4jClientOptions } from "./client/neo4j";
export { createPostgresClient } from "./client/postgres";
export type { PostgresClient } from "./client/postgres";

// Auth
export { buildAgentContext, callerFromHeaders } from "./auth/context";
export { assertRole, assertWriteScope, KgAuthError } from "./auth/middleware";

// Provenance
export {
  buildProvenance,
  computeTrustScore,
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_SOURCE_RELIABILITY,
} from "./provenance/compute";

// Audit
export { writeAuditEntry } from "./audit/writer";
export type { AuditEntry } from "./audit/writer";

// Cypher (read-only escape)
export { runCypher } from "./cypher/run";
export type { CypherResult, RunCypherDeps } from "./cypher/run";
export {
  assertReadOnly,
  CypherWriteAttemptError,
  CypherMalformedError,
} from "./cypher/validate";

// Embedding
export { createOpenAIEmbeddingProvider } from "./embedding/openai";
export { createMockEmbeddingProvider } from "./embedding/mock";
export type { EmbeddingProvider } from "./embedding/provider";

// Reads
export { getNode, getEdge } from "./reads/get-node";
export type { ReadDeps } from "./reads/get-node";
export { getProvenance } from "./reads/get-provenance";
export { findEntities } from "./reads/find-entities";
export type {
  SearchResult,
  FindEntitiesOptions,
  FindEntitiesDeps,
} from "./reads/find-entities";
export { findSimilar } from "./reads/find-similar";
export type {
  SimilarEntity,
  FindSimilarOptions,
  FindSimilarDeps,
} from "./reads/find-similar";
export { getEntityContext } from "./reads/get-entity-context";
export type {
  EntityContext,
  GetEntityContextOptions,
} from "./reads/get-entity-context";
export { traverse } from "./reads/traverse";
export type {
  TraversalPattern,
  TraversalResult,
} from "./reads/traverse";
export { getAuditLog } from "./reads/get-audit-log";
export type {
  AuditEntryRow,
  AuditQueryOpts,
} from "./reads/get-audit-log";

// Postgres → graph mappings (Month 2 ingestion)
export { POSTGRES_MAPPINGS, applyMapping, idFor, mappingFor } from "./mappings/postgres";
export type {
  PostgresMappings,
  TableMapping,
  PropertyMapping,
  RelationshipMapping,
  MappedRow,
  MappedEdge,
} from "./mappings/types";

// Writes (Month 2)
export { upsertFromPostgres } from "./writes/upsert-from-postgres";
export type { CDCEventLike, UpsertDeps, UpsertResult } from "./writes/upsert-from-postgres";
