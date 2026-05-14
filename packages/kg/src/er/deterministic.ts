import { writeAuditEntry } from "../audit/writer";
import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import type { AgentContext, EntityType } from "../types";
import { ENTITY_TYPES } from "../types";
import { linkEntities } from "../writes/links";

// ── Public types ────────────────────────────────────────────────────────────

export interface IdentityKey {
  /** The entity type this key applies to. */
  entityType: EntityType;
  /** Property name on the node. */
  property: string;
  /** Human-readable name for logs/audit (e.g. "person.email"). */
  label: string;
  /** Normalizer applied to both sides before comparison. */
  normalize?: (value: unknown) => string | null;
  /** Confidence applied to the SAME_AS edge when this key matches. */
  confidence: number;
}

export interface ResolveDeterministicInput {
  /** If omitted, run against every key in DEFAULT_IDENTITY_KEYS. */
  keys?: IdentityKey[];
  /** Scope to a subset of entity types if you want to chunk the work. */
  entityTypes?: EntityType[];
  /** Stop after this many matches (per key). Default: unbounded. */
  maxLinksPerKey?: number;
  /**
   * Dry run — find matches but do not write SAME_AS edges. Default false.
   * When true, `pairsLinked` still reflects the number of pairs that WOULD
   * have been linked; `pairsAlreadyExisted` is always 0 in this mode since
   * no edges are MERGEd.
   */
  dryRun?: boolean;
}

export interface ResolveDeterministicPerKey {
  key: IdentityKey;
  /** Number of distinct identity values with >1 node. */
  candidateGroups: number;
  /** Number of SAME_AS edges created or confirmed (or would-be-linked in dryRun). */
  pairsLinked: number;
  /** Subset of pairsLinked that already existed (always 0 in dryRun). */
  pairsAlreadyExisted: number;
}

export interface ResolveDeterministicResult {
  byKey: ResolveDeterministicPerKey[];
  totalLinks: number;
  totalAlreadyExisted: number;
}

// ── Default identity keys ───────────────────────────────────────────────────

/**
 * Default identity keys for deterministic ER.
 *
 * Each key declares: an entity type, a node property name, a normalizer, and a
 * confidence value applied to the SAME_AS edge when two nodes share the
 * normalized value of that property.
 *
 * Property names below correspond to the property names that nodes carry
 * post-upsert (see `POSTGRES_MAPPINGS` in `mappings/postgres.ts`).
 */
export const DEFAULT_IDENTITY_KEYS: IdentityKey[] = [
  {
    entityType: "Person",
    property: "email",
    label: "person.email",
    normalize: (v) =>
      typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null,
    confidence: 0.98,
  },
  {
    entityType: "Person",
    property: "github_login",
    label: "person.github_login",
    normalize: (v) =>
      typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null,
    confidence: 0.97,
  },
  {
    entityType: "Organization",
    property: "domain",
    label: "organization.domain",
    normalize: (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      return trimmed
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "");
    },
    confidence: 0.95,
  },
  {
    entityType: "Engagement",
    property: "stripe_customer_id",
    label: "engagement.stripe_customer_id",
    normalize: (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    confidence: 0.99,
  },
];

// ── Validators ──────────────────────────────────────────────────────────────

const ENTITY_TYPE_RE = /^[A-Z][A-Za-z0-9_]*$/;
const PROPERTY_NAME_RE = /^[a-z][a-zA-Z0-9_]*$/;
const MAX_CANDIDATE_ROWS = 10_000;

function validateKey(key: IdentityKey): void {
  if (!ENTITY_TYPE_RE.test(key.entityType)) {
    throw new Error(`unsafe entity type label: ${key.entityType}`);
  }
  if (!(ENTITY_TYPES as readonly string[]).includes(key.entityType)) {
    throw new Error(`unknown entity type: ${key.entityType}`);
  }
  if (!PROPERTY_NAME_RE.test(key.property)) {
    throw new Error(`unsafe property name: ${key.property}`);
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Run a deterministic entity-resolution pass.
 *
 * For each identity key, this function pulls all (id, raw value) pairs for
 * nodes of the key's entity type that have a non-null value on the key's
 * property, applies the key's `normalize` function in JS, groups by the
 * normalized value, and creates `SAME_AS` edges linking every non-canonical
 * node in each group to the canonical one (lowest id, matching the
 * canonicalization used by `linkEntities`).
 *
 * Notes:
 * - Stub nodes (`is_stub = true`) are skipped at the Cypher level.
 * - One Cypher round trip is performed per key, not per group.
 * - In `dryRun` mode, no `linkEntities` calls are made; `pairsLinked` reflects
 *   the number of pairs that WOULD have been linked.
 * - A single summary audit entry is written at the end. Each underlying
 *   `linkEntities` call writes its own per-edge audit row.
 */
export async function resolveDeterministic(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  input: ResolveDeterministicInput = {},
): Promise<ResolveDeterministicResult> {
  const start = Date.now();
  const keys = input.keys ?? DEFAULT_IDENTITY_KEYS;
  const dryRun = input.dryRun ?? false;
  const maxLinksPerKey = input.maxLinksPerKey ?? Number.POSITIVE_INFINITY;

  // Validate every key up-front so we fail fast before doing any I/O.
  for (const key of keys) {
    validateKey(key);
  }

  // Filter by entityTypes scope, if supplied.
  const activeKeys = input.entityTypes
    ? keys.filter((k) => input.entityTypes!.includes(k.entityType))
    : keys;

  const byKey: ResolveDeterministicPerKey[] = [];
  let totalLinks = 0;
  let totalAlreadyExisted = 0;

  try {
    for (const key of activeKeys) {
      const perKey = await resolveOneKey(deps, key, dryRun, maxLinksPerKey);
      byKey.push(perKey);
      totalLinks += perKey.pairsLinked;
      totalAlreadyExisted += perKey.pairsAlreadyExisted;
    }
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "resolveDeterministic",
      parameters: {
        keyLabels: activeKeys.map((k) => k.label),
        dryRun,
        maxLinksPerKey:
          maxLinksPerKey === Number.POSITIVE_INFINITY ? null : maxLinksPerKey,
      },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  await writeAuditEntry(deps.sql, {
    actorKind: deps.ctx.actorKind,
    actorId: deps.ctx.actorId,
    tool: "resolveDeterministic",
    parameters: {
      keyLabels: activeKeys.map((k) => k.label),
      dryRun,
      maxLinksPerKey:
        maxLinksPerKey === Number.POSITIVE_INFINITY ? null : maxLinksPerKey,
    },
    resultSummary: {
      totalLinks,
      totalAlreadyExisted,
      perKey: byKey.map((b) => ({
        label: b.key.label,
        candidateGroups: b.candidateGroups,
        pairsLinked: b.pairsLinked,
        pairsAlreadyExisted: b.pairsAlreadyExisted,
      })),
    },
    latencyMs: Date.now() - start,
    success: true,
  });

  return { byKey, totalLinks, totalAlreadyExisted };
}

// ── Per-key resolver ────────────────────────────────────────────────────────

async function resolveOneKey(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  key: IdentityKey,
  dryRun: boolean,
  maxLinksPerKey: number,
): Promise<ResolveDeterministicPerKey> {
  // Entity type label is validated against ENTITY_TYPE_RE in validateKey, so
  // interpolation here is safe. Property name lookup is parameterized via
  // `n[$prop]` so the property name never touches the Cypher string body.
  const cypher = `
    MATCH (n:\`${key.entityType}\`)
    WHERE n[$prop] IS NOT NULL
      AND coalesce(n.is_stub, false) = false
    RETURN n.id AS id, n[$prop] AS rawValue
    LIMIT ${MAX_CANDIDATE_ROWS}
  `;

  const rows = await deps.client.read(async (tx) => {
    const r = await tx.run(cypher, { prop: key.property });
    return r.records.map((rec) => ({
      id: rec.get("id") as string,
      rawValue: rec.get("rawValue") as unknown,
    }));
  });

  if (rows.length === MAX_CANDIDATE_ROWS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[deterministic-ER] ${key.label}: hit candidate row cap (${MAX_CANDIDATE_ROWS}); results may be partial`,
    );
  }

  // Group by normalized value.
  const groups = new Map<string, string[]>();
  const normalize =
    key.normalize ?? ((v: unknown) => (typeof v === "string" ? v : null));
  for (const row of rows) {
    const norm = normalize(row.rawValue);
    if (norm === null) continue;
    const existing = groups.get(norm);
    if (existing) {
      existing.push(row.id);
    } else {
      groups.set(norm, [row.id]);
    }
  }

  let candidateGroups = 0;
  let pairsLinked = 0;
  let pairsAlreadyExisted = 0;

  outer: for (const [normValue, ids] of groups) {
    if (ids.length < 2) continue;
    candidateGroups += 1;

    // Canonical = alphabetically smallest id (mirrors linkEntities).
    const sorted = [...ids].sort();
    const canonical = sorted[0];
    const others = sorted.slice(1);

    for (const other of others) {
      if (pairsLinked >= maxLinksPerKey) break outer;
      if (other === canonical) continue; // pre-filter self-links (defense in depth)

      if (dryRun) {
        pairsLinked += 1;
        continue;
      }

      const reason = `deterministic-ER: matched ${key.label}='${normValue}'`;
      const res = await linkEntities(deps, {
        aId: canonical,
        bId: other,
        reason,
        confidence: key.confidence,
      });
      pairsLinked += 1;
      if (res.alreadyExisted) pairsAlreadyExisted += 1;
    }
  }

  return { key, candidateGroups, pairsLinked, pairsAlreadyExisted };
}
