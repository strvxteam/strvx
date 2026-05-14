import type { EntityType, RelationshipType, SourceType } from "../types";

/** A single property carried from a Postgres column onto the graph entity. */
export interface PropertyMapping {
  /** Column name in Postgres. */
  column: string;
  /** Property key on the graph node. If absent, uses `column`. */
  as?: string;
  /** Optional transform applied at upsert time. */
  transform?: "lowercase" | "uppercase" | "trim";
}

/** A directed relationship to another entity, derived from an FK column. */
export interface RelationshipMapping {
  /** Postgres column whose value points at the target entity. */
  fkColumn: string;
  /** Target table (must also have a mapping in POSTGRES_MAPPINGS). */
  targetTable: string;
  /** Relationship type. */
  type: RelationshipType;
  /**
   * Direction:
   *   'out' — (this entity)-[r]->(target)
   *   'in'  — (target)-[r]->(this entity)
   */
  direction: "out" | "in";
}

/** A mapping for one Postgres table. */
export interface TableMapping {
  /** The Postgres table name (matches the wal2json `change.table`). */
  table: string;
  /** Entity type to produce in the graph. */
  entityType: EntityType;
  /** Primary key column in Postgres. */
  primaryKey: string;
  /**
   * Source type used in provenance for entities derived from this table.
   * Almost always 'postgres'.
   */
  sourceType: SourceType;
  /** Properties to copy from the row onto the node. */
  properties: PropertyMapping[];
  /** Outgoing/incoming relationships derived from FK columns. */
  relationships: RelationshipMapping[];
  /** Initial confidence for entities from this table (0..1). Default 1.0. */
  confidence?: number;
}

/** The complete mapping config — keyed by table name. */
export type PostgresMappings = Record<string, TableMapping>;

/** Output of applying a mapping to a CDC event's row. */
export interface MappedRow {
  /** Stable graph id: `${sourceType}:${table}:${pk}`. */
  nodeId: string;
  entityType: EntityType;
  /** Properties to write onto the node (post-transform). */
  properties: Record<string, unknown>;
  /** Edges derived from FKs. */
  edges: MappedEdge[];
}

export interface MappedEdge {
  /** Stable edge id: `${sourceType}:${table}:${pk}:${fkColumn}`. */
  edgeId: string;
  /** Relationship type. */
  type: RelationshipType;
  /** Graph id of the from-node. */
  from: string;
  /** Graph id of the to-node. */
  to: string;
}
