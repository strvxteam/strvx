import { writeAuditEntry } from "../audit/writer";
import { assertWriteScope } from "../auth/middleware";
import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import type { LLMProvider } from "../llm/index";
import type { AgentContext, EntityType } from "../types";
import { ENTITY_TYPES } from "../types";
import { jaroWinkler } from "../util/jaro-winkler";
import { linkEntities } from "../writes/links";

// ── Public types ────────────────────────────────────────────────────────────

export interface ProbabilisticERInput {
  /** Which entity types to scan. Default: ["Person", "Organization"]. */
  entityTypes?: EntityType[];
  /**
   * Property carrying the human-readable name on each entity. Per-type
   * overrides; defaults to "name" for Person and Organization.
   */
  nameProperty?: Partial<Record<EntityType, string>>;
  /** Auto-merge threshold (inclusive). Default 0.97. */
  autoMergeThreshold?: number;
  /** Review queue lower threshold (inclusive). Default 0.85. */
  reviewThreshold?: number;
  /** Max candidate pairs per block (caps O(N²) inside a block). Default 200. */
  maxPairsPerBlock?: number;
  /**
   * Optional LLM tiebreaker for the [reviewThreshold, autoMergeThreshold)
   * range. When provided, borderline pairs are sent to the LLM and the
   * answer optionally boosts or vetoes the score (see scoring rules).
   */
  llm?: LLMProvider;
  /** Cap on LLM calls per run (cost guard). Default 50. */
  maxLLMCalls?: number;
  /** Dry run — produce a report but don't write SAME_AS edges or queue rows. */
  dryRun?: boolean;
}

export interface ProbabilisticERPerType {
  entityType: EntityType;
  candidateNodes: number;
  blocks: number;
  pairsScored: number;
  autoMerged: number;
  queued: number;
  llmCalls: number;
}

export interface ProbabilisticERResult {
  byEntityType: ProbabilisticERPerType[];
  totals: { autoMerged: number; queued: number; llmCalls: number };
}

// ── Defaults / constants ────────────────────────────────────────────────────

const DEFAULT_ENTITY_TYPES: EntityType[] = ["Person", "Organization"];
const DEFAULT_NAME_PROPERTY: Partial<Record<EntityType, string>> = {
  Person: "name",
  Organization: "name",
};
const DEFAULT_AUTO_MERGE_THRESHOLD = 0.97;
const DEFAULT_REVIEW_THRESHOLD = 0.85;
const DEFAULT_MAX_PAIRS_PER_BLOCK = 200;
const DEFAULT_MAX_LLM_CALLS = 50;
const MAX_CANDIDATE_ROWS = 10_000;
const METHOD_NAME = "jaro_winkler";

// Cap for the email-conflict penalty: with conflicting emails we believe the
// nodes are NOT the same regardless of name similarity. Setting to exactly
// reviewThreshold (default 0.85) routes the pair to the review queue.
const EMAIL_CONFLICT_CAP = 0.85;

// Domain-match boost: when both share a domain, lift the score above the
// review threshold but below auto-merge so a human still confirms.
const DOMAIN_MATCH_BOOST = 0.95;

const ENTITY_TYPE_RE = /^[A-Z][A-Za-z0-9_]*$/;
const PROPERTY_NAME_RE = /^[a-z][a-zA-Z0-9_]*$/;

// ── Validators ──────────────────────────────────────────────────────────────

function validateEntityType(entityType: EntityType): void {
  if (!ENTITY_TYPE_RE.test(entityType)) {
    throw new Error(`unsafe entity type label: ${entityType}`);
  }
  if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new Error(`unknown entity type: ${entityType}`);
  }
}

function validatePropertyName(prop: string): void {
  if (!PROPERTY_NAME_RE.test(prop)) {
    throw new Error(`unsafe property name: ${prop}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  name: string;
  normName: string; // lowercase + diacritic-stripped + trimmed-leading-non-letters
  email: string | null;
  domain: string | null;
}

/** Lowercase, strip diacritics, drop leading non-letters. */
function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  let s = value.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
  s = s.toLowerCase().trim();
  // Drop leading non-letter characters so blocking-by-first-letter is stable
  // for inputs like "  John" or "(Acme) Corp".
  const m = s.match(/[a-z]/);
  if (!m) return "";
  return s.slice(s.indexOf(m[0]));
}

/** Blocking key = first letter [a-z], or "_misc" if none. */
function blockingKey(normName: string): string {
  if (!normName) return "_misc";
  const c = normName.charCodeAt(0);
  if (c >= 97 && c <= 122) return normName[0];
  return "_misc";
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function normalizeDomain(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  return t.length > 0 ? t : null;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// LLM JSON schema/parse for the tiebreaker.
interface LLMVerdict {
  same_entity: boolean;
  confidence: number;
  reasoning: string;
}

const LLM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["same_entity", "confidence", "reasoning"],
  properties: {
    same_entity: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string" },
  },
} as const;

function parseLLMVerdict(obj: unknown): LLMVerdict {
  if (!obj || typeof obj !== "object") {
    throw new Error("LLM verdict: expected object");
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.same_entity !== "boolean") {
    throw new Error("LLM verdict: same_entity must be boolean");
  }
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) {
    throw new Error("LLM verdict: confidence must be number in [0,1]");
  }
  if (typeof o.reasoning !== "string") {
    throw new Error("LLM verdict: reasoning must be string");
  }
  return {
    same_entity: o.same_entity,
    confidence: o.confidence,
    reasoning: o.reasoning,
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Probabilistic entity resolution: name-similarity + cheap blocking.
 *
 * Pipeline per entity type:
 *   1. Fetch candidates (non-stub, name-bearing).
 *   2. Block by first letter of normalized name (cheap, deterministic).
 *   3. Skip pairs that already have a SAME_AS edge (one round-trip per block).
 *   4. Score with Jaro-Winkler on the normalized name; apply email/domain
 *      attribute consistency adjustments.
 *   5. Optional LLM tiebreaker in [reviewThreshold, autoMergeThreshold).
 *   6. Auto-merge via {@link linkEntities} when score ≥ autoMergeThreshold;
 *      otherwise queue into `kg_er_review_queue` when score is in the review
 *      band; drop everything below.
 *
 * Auth uses the same `Observation` write scope as `linkEntities`/T13 since
 * the output is a graph annotation, not a typed entity write.
 */
export async function resolveProbabilistic(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  input: ProbabilisticERInput = {},
): Promise<ProbabilisticERResult> {
  const start = Date.now();
  const entityTypes = input.entityTypes ?? DEFAULT_ENTITY_TYPES;
  const nameProperty = { ...DEFAULT_NAME_PROPERTY, ...(input.nameProperty ?? {}) };
  const autoMergeThreshold =
    input.autoMergeThreshold ?? DEFAULT_AUTO_MERGE_THRESHOLD;
  const reviewThreshold = input.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD;
  const maxPairsPerBlock =
    input.maxPairsPerBlock ?? DEFAULT_MAX_PAIRS_PER_BLOCK;
  const maxLLMCalls = input.maxLLMCalls ?? DEFAULT_MAX_LLM_CALLS;
  const dryRun = input.dryRun ?? false;

  if (reviewThreshold > autoMergeThreshold) {
    throw new Error(
      `reviewThreshold (${reviewThreshold}) must be <= autoMergeThreshold (${autoMergeThreshold})`,
    );
  }

  // 1. Auth — same fudge as T12/T13: gate on Observation because SAME_AS is
  //    a graph annotation.
  try {
    assertWriteScope(deps.ctx, "Observation", "resolveProbabilistic");
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "resolveProbabilistic",
      parameters: { entityTypes, dryRun },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  // Validate inputs.
  for (const t of entityTypes) validateEntityType(t);
  for (const t of entityTypes) {
    const p = nameProperty[t];
    if (!p) {
      throw new Error(`no name property configured for entity type ${t}`);
    }
    validatePropertyName(p);
  }

  const llmCallBudget = { remaining: maxLLMCalls };
  const byEntityType: ProbabilisticERPerType[] = [];

  try {
    for (const entityType of entityTypes) {
      const perType = await resolveOneType(deps, {
        entityType,
        nameProp: nameProperty[entityType]!,
        autoMergeThreshold,
        reviewThreshold,
        maxPairsPerBlock,
        llm: input.llm,
        llmCallBudget,
        dryRun,
      });
      byEntityType.push(perType);
    }
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "resolveProbabilistic",
      parameters: {
        entityTypes,
        autoMergeThreshold,
        reviewThreshold,
        maxPairsPerBlock,
        dryRun,
      },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  const totals = byEntityType.reduce(
    (acc, p) => ({
      autoMerged: acc.autoMerged + p.autoMerged,
      queued: acc.queued + p.queued,
      llmCalls: acc.llmCalls + p.llmCalls,
    }),
    { autoMerged: 0, queued: 0, llmCalls: 0 },
  );

  await writeAuditEntry(deps.sql, {
    actorKind: deps.ctx.actorKind,
    actorId: deps.ctx.actorId,
    tool: "resolveProbabilistic",
    parameters: {
      entityTypes,
      autoMergeThreshold,
      reviewThreshold,
      maxPairsPerBlock,
      maxLLMCalls,
      dryRun,
    },
    resultSummary: {
      totals,
      byEntityType: byEntityType.map((p) => ({
        entityType: p.entityType,
        candidateNodes: p.candidateNodes,
        blocks: p.blocks,
        pairsScored: p.pairsScored,
        autoMerged: p.autoMerged,
        queued: p.queued,
        llmCalls: p.llmCalls,
      })),
    },
    latencyMs: Date.now() - start,
    success: true,
  });

  return { byEntityType, totals };
}

// ── Per-type resolver ───────────────────────────────────────────────────────

interface PerTypeConfig {
  entityType: EntityType;
  nameProp: string;
  autoMergeThreshold: number;
  reviewThreshold: number;
  maxPairsPerBlock: number;
  llm?: LLMProvider;
  llmCallBudget: { remaining: number };
  dryRun: boolean;
}

async function resolveOneType(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  cfg: PerTypeConfig,
): Promise<ProbabilisticERPerType> {
  const candidates = await fetchCandidates(deps.client, cfg.entityType, cfg.nameProp);
  const blocks = groupByBlock(candidates);
  const existingPairs = await fetchExistingSameAsPairs(
    deps.client,
    cfg.entityType,
  );

  let pairsScored = 0;
  let autoMerged = 0;
  let queued = 0;
  let llmCalls = 0;
  let blockCount = 0;

  for (const [, items] of blocks) {
    if (items.length < 2) continue;
    blockCount++;

    // Deterministic ordering for sampling cap: sort by normName then id.
    items.sort((a, b) => {
      if (a.normName !== b.normName) return a.normName < b.normName ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    let pairsInBlock = 0;
    let hitCap = false;

    outer: for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (pairsInBlock >= cfg.maxPairsPerBlock) {
          hitCap = true;
          break outer;
        }
        const a = items[i].id < items[j].id ? items[i] : items[j];
        const b = items[i].id < items[j].id ? items[j] : items[i];
        if (hasExistingSameAs(existingPairs, a.id, b.id)) {
          pairsInBlock++;
          continue;
        }
        pairsInBlock++;
        pairsScored++;

        const outcome = await scoreAndAct(deps, {
          a,
          b,
          cfg,
          llmCallBudget: cfg.llmCallBudget,
        });
        if (outcome.kind === "auto") autoMerged++;
        else if (outcome.kind === "queue") queued++;
        if (outcome.usedLLM) llmCalls++;
      }
    }

    if (hitCap) {
      // eslint-disable-next-line no-console
      console.warn(
        `[probabilistic-ER] ${cfg.entityType}: block hit pair cap (${cfg.maxPairsPerBlock}); results may be partial`,
      );
    }
  }

  return {
    entityType: cfg.entityType,
    candidateNodes: candidates.length,
    blocks: blockCount,
    pairsScored,
    autoMerged,
    queued,
    llmCalls,
  };
}

// ── Candidate fetch ─────────────────────────────────────────────────────────

async function fetchCandidates(
  client: Neo4jClient,
  entityType: EntityType,
  nameProp: string,
): Promise<Candidate[]> {
  // entityType and nameProp are validated in the entry point. The label is
  // safely interpolated via backticks; the property name is passed as a
  // parameter so it never touches the Cypher string body.
  const cypher = `
    MATCH (n:\`${entityType}\`)
    WHERE n[$nameProp] IS NOT NULL
      AND coalesce(n.is_stub, false) = false
    RETURN n.id AS id,
           n[$nameProp] AS name,
           n.email AS email,
           n.domain AS domain
    LIMIT ${MAX_CANDIDATE_ROWS}
  `;

  const rows = await client.read(async (tx) => {
    const r = await tx.run(cypher, { nameProp });
    return r.records.map((rec) => ({
      id: rec.get("id") as string,
      rawName: rec.get("name") as unknown,
      rawEmail: rec.get("email") as unknown,
      rawDomain: rec.get("domain") as unknown,
    }));
  });

  if (rows.length === MAX_CANDIDATE_ROWS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[probabilistic-ER] ${entityType}: hit candidate row cap (${MAX_CANDIDATE_ROWS}); results may be partial`,
    );
  }

  const out: Candidate[] = [];
  for (const row of rows) {
    if (typeof row.rawName !== "string") continue;
    const normName = normalizeName(row.rawName);
    if (!normName) continue;
    out.push({
      id: row.id,
      name: row.rawName,
      normName,
      email: normalizeEmail(row.rawEmail),
      domain: normalizeDomain(row.rawDomain),
    });
  }
  return out;
}

function groupByBlock(candidates: Candidate[]): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const k = blockingKey(c.normName);
    const arr = m.get(k);
    if (arr) arr.push(c);
    else m.set(k, [c]);
  }
  return m;
}

// ── Existing SAME_AS short-circuit ──────────────────────────────────────────

async function fetchExistingSameAsPairs(
  client: Neo4jClient,
  entityType: EntityType,
): Promise<Set<string>> {
  const cypher = `
    MATCH (a:\`${entityType}\`)-[r:SAME_AS]-(b:\`${entityType}\`)
    WHERE a.id < b.id
    RETURN a.id AS aId, b.id AS bId
  `;
  const rows = await client.read(async (tx) => {
    const r = await tx.run(cypher);
    return r.records.map((rec) => ({
      a: rec.get("aId") as string,
      b: rec.get("bId") as string,
    }));
  });
  const set = new Set<string>();
  for (const { a, b } of rows) set.add(`${a} ${b}`);
  return set;
}

function hasExistingSameAs(
  pairs: Set<string>,
  aId: string,
  bId: string,
): boolean {
  const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
  return pairs.has(`${lo} ${hi}`);
}

// ── Scoring + decision ──────────────────────────────────────────────────────

interface ScoreOutcome {
  kind: "drop" | "queue" | "auto";
  usedLLM: boolean;
}

async function scoreAndAct(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  args: {
    a: Candidate;
    b: Candidate;
    cfg: PerTypeConfig;
    llmCallBudget: { remaining: number };
  },
): Promise<ScoreOutcome> {
  const { a, b, cfg, llmCallBudget } = args;

  const nameJW = jaroWinkler(a.normName, b.normName);
  let score = nameJW;
  let emailConflict = false;
  let domainMatch = false;

  // Email conflict: both present, different → veto auto-merge by capping.
  if (a.email && b.email && a.email !== b.email) {
    emailConflict = true;
    score = Math.min(score, EMAIL_CONFLICT_CAP);
  }
  // Domain consistency: both present and equal → boost into review band at
  // worst, ensuring the pair surfaces for human review.
  if (a.domain && b.domain && a.domain === b.domain) {
    domainMatch = true;
    score = Math.max(score, DOMAIN_MATCH_BOOST);
  }

  score = clamp01(score);

  let usedLLM = false;

  // LLM tiebreaker for borderline pairs.
  if (
    cfg.llm &&
    score >= cfg.reviewThreshold &&
    score < cfg.autoMergeThreshold &&
    llmCallBudget.remaining > 0
  ) {
    llmCallBudget.remaining -= 1;
    usedLLM = true;
    try {
      const verdict = await askLLM(cfg.llm, cfg.entityType, a, b);
      if (verdict.same_entity && verdict.confidence >= 0.9) {
        // Strong yes → boost into auto-merge range.
        score = Math.max(score, cfg.autoMergeThreshold);
      } else if (!verdict.same_entity && verdict.confidence >= 0.9) {
        // Strong no → drop.
        return { kind: "drop", usedLLM };
      }
      // Otherwise leave score unchanged → still goes to review queue.
    } catch (err) {
      // LLM hiccup is non-fatal — keep the original score and let the pair
      // flow into the review queue.
      // eslint-disable-next-line no-console
      console.warn(
        `[probabilistic-ER] LLM tiebreaker failed for ${a.id}/${b.id}: ${(err as Error).message}`,
      );
    }
  }

  const features = {
    name_jw: round4(nameJW),
    email_conflict: emailConflict,
    domain_match: domainMatch,
    used_llm: usedLLM,
  };

  if (score >= cfg.autoMergeThreshold) {
    if (!cfg.dryRun) {
      await linkEntities(deps, {
        aId: a.id,
        bId: b.id,
        reason: `probabilistic-ER: name-similarity (score=${score.toFixed(4)})`,
        confidence: score,
      });
    }
    return { kind: "auto", usedLLM };
  }

  if (score >= cfg.reviewThreshold) {
    if (!cfg.dryRun) {
      await queueForReview(deps.sql, {
        aId: a.id,
        bId: b.id,
        entityType: cfg.entityType,
        score,
        features,
      });
    }
    return { kind: "queue", usedLLM };
  }

  return { kind: "drop", usedLLM };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

async function askLLM(
  llm: LLMProvider,
  entityType: EntityType,
  a: Candidate,
  b: Candidate,
): Promise<LLMVerdict> {
  const describe = (c: Candidate) =>
    `name=${JSON.stringify(c.name)}, email=${c.email ?? "null"}, domain=${c.domain ?? "null"}`;
  const prompt = `Are these two records about the same real-world entity?\nEntity type: ${entityType}.\nA: ${describe(a)}\nB: ${describe(b)}\nReturn JSON: { "same_entity": boolean, "confidence": number 0..1, "reasoning": string }.`;

  const res = await llm.completeJSON<LLMVerdict>({
    system:
      "You are an entity-resolution tiebreaker. Decide whether two records refer to the same real-world entity. Return strict JSON only.",
    messages: [{ role: "user", content: prompt }],
    schema: LLM_SCHEMA as unknown as Record<string, unknown>,
    parse: parseLLMVerdict,
    maxTokens: 256,
    temperature: 0,
  });
  return res.data;
}

// ── Review queue write ─────────────────────────────────────────────────────

async function queueForReview(
  sql: PostgresClient,
  row: {
    aId: string;
    bId: string;
    entityType: EntityType;
    score: number;
    features: Record<string, unknown>;
  },
): Promise<void> {
  // Canonicalize pair so the UNIQUE (candidate_a_id, candidate_b_id, method)
  // constraint deduplicates regardless of input order.
  const [a, b] = row.aId < row.bId ? [row.aId, row.bId] : [row.bId, row.aId];
  await sql`
    INSERT INTO kg_er_review_queue (
      candidate_a_id, candidate_b_id, entity_type, score, method, features
    ) VALUES (
      ${a}, ${b}, ${row.entityType}, ${row.score}, ${METHOD_NAME},
      ${sql.json(row.features as Parameters<typeof sql.json>[0])}
    )
    ON CONFLICT (candidate_a_id, candidate_b_id, method) DO NOTHING
  `;
}
