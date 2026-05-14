import "server-only";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gbrainSearch, isGbrainConfigured } from "./gbrain-mcp";

const BRAIN_DIR = (() => {
  return resolve(process.cwd(), "..", "..", "brain");
})();

export interface BrainNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  provenance: BrainProvenance;
}

export interface BrainEdge {
  id: string;
  type: string;
  from: string;
  to: string;
  properties: Record<string, unknown>;
  provenance: BrainProvenance;
}

export interface BrainProvenance {
  source_type: string;
  source_id?: string;
  extraction_method: string;
  trust_score: number;
  confidence: number;
  last_validated_at?: string;
  created_by: string;
  validation_count: number;
}

export interface BrainContext {
  nodes: BrainNode[];
  edges: BrainEdge[];
}

interface ParsedPage {
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
  compiled: string;
  timeline: string;
}

const PAGE_CACHE = new Map<string, ParsedPage>();
let SLUG_INDEX_BUILT = false;
const SLUG_INDEX = new Set<string>();
let BUILD_PROMISE: Promise<void> | null = null;
let SOURCE_ID_INDEX: Map<string, string> | null = null;

async function buildSlugIndex(): Promise<void> {
  if (SLUG_INDEX_BUILT) return;
  if (BUILD_PROMISE) return BUILD_PROMISE;
  BUILD_PROMISE = (async () => {
    SLUG_INDEX.clear();
    for (const dir of ["people", "companies", "deals", "projects", "meetings", "finances", "inbox"]) {
      const full = join(BRAIN_DIR, dir);
      let entries: string[] = [];
      try { entries = await readdir(full); } catch { continue; }
      for (const name of entries) {
        if (!name.endsWith(".md")) continue;
        if (name.startsWith("_")) continue;
        SLUG_INDEX.add(`${dir}/${name.slice(0, -3)}`);
      }
    }
    SLUG_INDEX_BUILT = true;
    BUILD_PROMISE = null;
  })();
  return BUILD_PROMISE;
}

export function invalidateBrainCache(): void {
  PAGE_CACHE.clear();
  SLUG_INDEX.clear();
  SLUG_INDEX_BUILT = false;
  SOURCE_ID_INDEX = null;
}

async function loadPageBySlug(slug: string): Promise<ParsedPage | null> {
  const cached = PAGE_CACHE.get(slug);
  if (cached) return cached;
  await buildSlugIndex();
  if (!SLUG_INDEX.has(slug)) return null;
  const path = join(BRAIN_DIR, `${slug}.md`);
  let raw: string;
  try { raw = await readFile(path, "utf8"); } catch { return null; }
  const parsed = parsePage(slug, raw);
  PAGE_CACHE.set(slug, parsed);
  return parsed;
}

function parsePage(slug: string, raw: string): ParsedPage {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter: Record<string, unknown> = {};
  let body = raw;
  if (fmMatch) {
    body = fmMatch[2];
    for (const line of fmMatch[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      let val: string = line.slice(idx + 1).trim();
      if (!key) continue;
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
        frontmatter[key] = val;
      } else if (val === "true" || val === "false") {
        frontmatter[key] = val === "true";
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        frontmatter[key] = Number(val);
      } else if (val === "" || val === "null") {
        frontmatter[key] = null;
      } else {
        frontmatter[key] = val;
      }
    }
  }
  const dividerIdx = findTimelineDivider(body);
  let compiled = body;
  let timeline = "";
  if (dividerIdx >= 0) {
    compiled = body.slice(0, dividerIdx).trim();
    timeline = body.slice(dividerIdx).replace(/^---\n?/, "").trim();
  }
  return { slug, frontmatter, body, compiled, timeline };
}

function findTimelineDivider(body: string): number {
  const re = /\n---\n/g;
  const match = re.exec(body);
  if (!match) return -1;
  return match.index + 1;
}

const WIKILINK_RE = /\[\[([a-z0-9_-]+\/[a-z0-9._-]+)(?:\|[^\]]+)?\]\]/g;

function extractWikilinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(WIKILINK_RE)) out.add(m[1]);
  return [...out];
}

function inferTypeFromSlug(slug: string): string {
  const dir = slug.split("/")[0];
  switch (dir) {
    case "people": return "Person";
    case "companies": return "Organization";
    case "deals": return "Engagement";
    case "projects": return "Engagement";
    case "meetings": return "Interaction";
    case "finances": return "FinancialEvent";
    default: return "Note";
  }
}

// Once-per-process warning when SIT's search falls back from gbrain to the
// fs substring scorer. Keeps logs quiet under normal load but surfaces an
// outage exactly once per dev/server lifetime.
let _fallbackWarned = false;
function warnFallback(query: string): void {
  if (_fallbackWarned) return;
  _fallbackWarned = true;
  console.warn(
    `[brain-reader] gbrain MCP returned no usable hits for query=${JSON.stringify(query)} — falling back to substring scoring. Check that ${process.env.GBRAIN_MCP_URL ?? "<unset>"} is reachable and that the bearer token is valid.`,
  );
}

function pageToNode(page: ParsedPage): BrainNode {
  const fm = page.frontmatter;
  const synced = typeof fm.synced_at === "string" ? fm.synced_at : undefined;
  return {
    id: page.slug,
    type: inferTypeFromSlug(page.slug),
    properties: { ...fm, compiled: page.compiled, timeline: page.timeline },
    provenance: {
      source_type: typeof fm.source_table === "string" ? fm.source_table : "brain",
      source_id: typeof fm.source_id === "string" ? fm.source_id : undefined,
      extraction_method: "brain-sync",
      trust_score: 1,
      confidence: 1,
      last_validated_at: synced,
      created_by: "brain-sync",
      validation_count: 0,
    },
  };
}

export async function getBrainNode(id: string): Promise<BrainNode | null> {
  const page = await loadPageBySlug(id);
  return page ? pageToNode(page) : null;
}

export async function getBrainContext(id: string, depth = 2, limit = 50): Promise<BrainContext | null> {
  const root = await loadPageBySlug(id);
  if (!root) return null;
  const visited = new Map<string, BrainNode>();
  const edges: BrainEdge[] = [];
  const queue: Array<{ slug: string; d: number }> = [{ slug: id, d: 0 }];
  visited.set(id, pageToNode(root));

  while (queue.length > 0 && visited.size < limit) {
    const { slug, d } = queue.shift()!;
    if (d >= depth) continue;
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    const links = extractWikilinks(page.body);
    for (const target of links) {
      if (target === slug) continue;
      const edgeId = `${slug}->${target}`;
      edges.push({
        id: edgeId,
        type: "REFERENCES",
        from: slug,
        to: target,
        properties: {},
        provenance: {
          source_type: "brain",
          extraction_method: "wikilink",
          trust_score: 1,
          confidence: 1,
          created_by: "brain-reader",
          validation_count: 0,
        },
      });
      if (!visited.has(target)) {
        const tgt = await loadPageBySlug(target);
        if (tgt) {
          visited.set(target, pageToNode(tgt));
          queue.push({ slug: target, d: d + 1 });
        }
      }
    }
  }
  return { nodes: [...visited.values()], edges };
}

export async function searchBrain(query: string, limit = 20): Promise<Array<{ node: BrainNode; score: number }>> {
  // Prefer gbrain hybrid (keyword + vector via RRF) when it's configured —
  // it understands multi-word queries and stale-content de-prioritization.
  // Fall back to substring scoring when gbrain is unreachable or returns
  // nothing useful.
  if (isGbrainConfigured()) {
    const hits = await gbrainSearch(query, limit);
    if (hits && hits.length > 0) {
      const out: Array<{ node: BrainNode; score: number }> = [];
      const seen = new Set<string>();
      for (const h of hits) {
        if (!h.slug || h.slug.startsWith("_")) continue;
        if (h.slug.endsWith("/_readme") || h.slug.endsWith("readme")) continue;
        if (seen.has(h.slug)) continue;
        seen.add(h.slug);
        const page = await loadPageBySlug(h.slug);
        if (!page) continue;
        out.push({ node: pageToNode(page), score: h.score ?? 0 });
      }
      if (out.length > 0) return out.slice(0, limit);
    }
    // gbrain is configured but returned nothing / unreachable. Log once per
    // process so operators see when the fallback is firing in dev logs.
    warnFallback(query);
  }

  // Fallback: substring scoring against frontmatter + body.
  await buildSlugIndex();
  const q = query.toLowerCase();
  const out: Array<{ node: BrainNode; score: number }> = [];
  for (const slug of SLUG_INDEX) {
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    let score = 0;
    if (slug.toLowerCase().includes(q)) score += 3;
    const name = typeof page.frontmatter.name === "string" ? page.frontmatter.name : "";
    if (name.toLowerCase().includes(q)) score += 5;
    if (page.body.toLowerCase().includes(q)) score += 1;
    if (score > 0) out.push({ node: pageToNode(page), score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function isPlaceholderNode(n: BrainNode): boolean {
  return (n.properties as Record<string, unknown>).company_kind === "placeholder";
}

export async function listBrainByType(
  type: string,
  limit = 100,
  opts: { includePlaceholders?: boolean } = {},
): Promise<BrainNode[]> {
  await buildSlugIndex();
  const out: BrainNode[] = [];
  for (const slug of SLUG_INDEX) {
    if (inferTypeFromSlug(slug) !== type) continue;
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    const node = pageToNode(page);
    if (!opts.includePlaceholders && isPlaceholderNode(node)) continue;
    out.push(node);
    if (out.length >= limit) break;
  }
  return out;
}

export async function listBrainNodes(
  limit = 1000,
  opts: { includePlaceholders?: boolean } = {},
): Promise<BrainNode[]> {
  await buildSlugIndex();
  const out: BrainNode[] = [];
  for (const slug of SLUG_INDEX) {
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    const node = pageToNode(page);
    if (!opts.includePlaceholders && isPlaceholderNode(node)) continue;
    out.push(node);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Single-pass wikilink edge enumeration across the entire brain. Used by
 * loadGraph; doing this here in one pass (instead of N getBrainContext
 * calls) cuts /kg/graph render time roughly proportionally to the page
 * count.
 *
 * `inScope` constrains both endpoints — edges to pages outside the slug
 * set get dropped so the force-graph viz doesn't render dangling nodes.
 */
export async function listBrainEdges(
  inScope: Set<string>,
): Promise<BrainEdge[]> {
  await buildSlugIndex();
  const edges: BrainEdge[] = [];
  for (const slug of SLUG_INDEX) {
    if (!inScope.has(slug)) continue;
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    const links = extractWikilinks(page.body);
    for (const target of links) {
      if (target === slug) continue;
      if (!inScope.has(target)) continue;
      edges.push({
        id: `${slug}->${target}`,
        type: "REFERENCES",
        from: slug,
        to: target,
        properties: {},
        provenance: {
          source_type: "brain",
          extraction_method: "wikilink",
          trust_score: 1,
          confidence: 1,
          created_by: "brain-reader",
          validation_count: 0,
        },
      });
    }
  }
  return edges;
}

/**
 * Resolve a Postgres source id (the UUID written into frontmatter as
 * `source_id`) to its brain slug. The embedded KgRelatedPanel passes
 * `postgres:<table>:<uuid>`-shaped ids from when the KG was Neo4j-backed;
 * we accept both the legacy form and a bare UUID and walk the brain to
 * find the matching page.
 *
 * Cached: a single full-brain scan builds a Postgres UUID → slug index
 * lazily.
 */
export async function resolveBrainSlug(id: string): Promise<string | null> {
  // Already a slug? Return as-is if it points at a known page.
  await buildSlugIndex();
  if (SLUG_INDEX.has(id)) return id;
  // Strip "postgres:<table>:" prefix when present.
  const uuid = id.includes(":") ? id.split(":").pop() ?? id : id;
  if (!SOURCE_ID_INDEX) {
    const idx = new Map<string, string>();
    for (const slug of SLUG_INDEX) {
      const page = await loadPageBySlug(slug);
      if (!page) continue;
      const sid = page.frontmatter.source_id;
      if (typeof sid === "string" && sid) idx.set(sid, slug);
    }
    SOURCE_ID_INDEX = idx;
  }
  return SOURCE_ID_INDEX.get(uuid) ?? null;
}

export async function listBrainLabelCounts(): Promise<Array<{ label: string; count: number }>> {
  await buildSlugIndex();
  const counts = new Map<string, number>();
  for (const slug of SLUG_INDEX) {
    const label = inferTypeFromSlug(slug);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/**
 * Pages whose source row changed in the last `days` days, sorted newest first.
 * Uses frontmatter.source_updated_at (set by brain-sync from
 * stage_entered_at / created_at / etc). When that's missing, falls back to
 * the provenance last_validated_at (which marks when we re-synced).
 */
export async function listRecentBrainNodes(
  days = 7,
  limit = 30,
): Promise<BrainNode[]> {
  await buildSlugIndex();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const candidates: Array<{ node: BrainNode; when: string }> = [];
  for (const slug of SLUG_INDEX) {
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    const fm = page.frontmatter;
    const raw =
      (typeof fm.source_updated_at === "string" ? fm.source_updated_at : null) ??
      (typeof fm.synced_at === "string" ? fm.synced_at : null);
    if (!raw) continue;
    const when = String(raw).slice(0, 10);
    if (when < cutoff) continue;
    candidates.push({ node: pageToNode(page), when });
  }
  candidates.sort((a, b) => (a.when < b.when ? 1 : -1));
  return candidates.slice(0, limit).map((c) => c.node);
}

/**
 * Every "- [ ] …" line under an `## Open Threads` heading, surfaced with
 * the slug of the page it lives on. The agent uses this to answer
 * "what's outstanding across all engagements?".
 */
export interface OpenThread {
  /** Owning page slug, e.g. "deals/beta-test-project". */
  slug: string;
  /** Owning page name from frontmatter. */
  owner_name: string;
  /** The bullet body, with the "[ ]" marker stripped. */
  text: string;
}

export async function listBrainOpenThreads(limit = 100): Promise<OpenThread[]> {
  await buildSlugIndex();
  const out: OpenThread[] = [];
  for (const slug of SLUG_INDEX) {
    const page = await loadPageBySlug(slug);
    if (!page) continue;
    const section = extractSection(page.compiled, "Open Threads");
    if (!section) continue;
    for (const line of section.split("\n")) {
      const m = line.match(/^\s*-\s*\[\s*\]\s*(.+)$/);
      if (!m) continue;
      const ownerName =
        typeof page.frontmatter.name === "string"
          ? page.frontmatter.name
          : slug;
      out.push({ slug, owner_name: ownerName, text: m[1].trim() });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function extractSection(text: string, heading: string): string | null {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && lines[i].toLowerCase().includes(heading.toLowerCase())) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}
