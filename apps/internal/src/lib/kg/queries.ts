import "server-only";
import {
  getBrainNode,
  getBrainContext,
  searchBrain,
  listBrainByType,
  listBrainLabelCounts,
  listBrainNodes,
  listBrainEdges,
  type BrainNode,
  type BrainContext,
} from "./brain-reader";

// The function signatures and return shapes here are intentionally kept
// close to the previous @strvx/kg-backed API so the existing UI components
// keep working unchanged. Under the hood, everything now reads from the
// markdown brain at <repo-root>/brain/.

export type Node = BrainNode;
export type EntityContext = BrainContext;
export interface SearchResult {
  node: BrainNode;
  score: number;
}

export async function searchEntities(
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  return searchBrain(query, limit);
}

export async function getNodeById(id: string): Promise<Node | null> {
  return getBrainNode(id);
}

export async function getContext(
  id: string,
  depth = 2,
  limit = 50,
): Promise<EntityContext> {
  const ctx = await getBrainContext(id, depth, limit);
  return ctx ?? { nodes: [], edges: [] };
}

export interface RecentEntity {
  id: string;
  labels: string[];
  name: string | null;
  summary: string | null;
  lastValidatedAt: string | null;
}

export async function recentEntities(limit = 12): Promise<RecentEntity[]> {
  const nodes = await listBrainNodes(500);
  nodes.sort((a, b) => {
    const da = a.provenance.last_validated_at ?? "";
    const db = b.provenance.last_validated_at ?? "";
    return db.localeCompare(da);
  });
  return nodes.slice(0, limit).map((n) => {
    const p = n.properties;
    const name =
      (p.name as string | undefined) ??
      (p.title as string | undefined) ??
      (typeof p.compiled === "string"
        ? (p.compiled as string).split("\n")[0].replace(/^#\s*/, "")
        : null);
    return {
      id: n.id,
      labels: [n.type],
      name: name ?? null,
      summary: null,
      lastValidatedAt: n.provenance.last_validated_at ?? null,
    };
  });
}

export async function labelCounts(): Promise<
  Array<{ label: string; count: number }>
> {
  return listBrainLabelCounts();
}

export interface NoteRow {
  id: string;
  title: string;
  summary: string | null;
  note_type: string | null;
  tags: string[] | null;
  owner_id: string | null;
  rel_path: string | null;
}

export async function listNotes(limit = 100): Promise<NoteRow[]> {
  // Notes don't have a dedicated brain dir in the strvx-only schema yet;
  // fall back to the inbox/ directory for any free-form pages.
  const nodes = await listBrainByType("Note", limit);
  return nodes.map((n) => {
    const p = n.properties;
    return {
      id: n.id,
      title:
        (p.name as string | undefined) ??
        (p.title as string | undefined) ??
        n.id,
      summary: typeof p.compiled === "string" ? (p.compiled as string).slice(0, 200) : null,
      note_type: null,
      tags: null,
      owner_id: null,
      rel_path: n.id,
    };
  });
}

export interface BrowseEntity {
  id: string;
  name: string;
  summary: string | null;
}

export interface GraphNode {
  id: string;
  name: string;
  label: string;
  summary: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function loadGraph(
  opts: { labels?: string[]; limit?: number } = {},
): Promise<GraphPayload> {
  const labels = opts.labels ?? [
    "Person",
    "Organization",
    "Engagement",
    "Note",
    "Decision",
    "Task",
    "Interaction",
  ];
  const limit = opts.limit ?? 200;
  const nodes = await listBrainNodes(limit * 2);
  const filtered = nodes.filter((n) => labels.includes(n.type)).slice(0, limit);
  const idSet = new Set(filtered.map((n) => n.id));
  const graphNodes: GraphNode[] = filtered.map((n) => {
    const p = n.properties;
    const name =
      (p.name as string | undefined) ??
      (p.title as string | undefined) ??
      (typeof p.compiled === "string"
        ? (p.compiled as string).split("\n")[0].replace(/^#\s*/, "")
        : null) ??
      n.id;
    return {
      id: n.id,
      name,
      label: n.type,
      summary: null,
    };
  });

  // Single-pass edge enumeration: brain-reader walks every page once and
  // returns only in-set edges, instead of the previous O(N*M) getBrainContext
  // loop. Big perf win for /kg/graph at scale.
  const rawEdges = await listBrainEdges(idSet);
  const edges: GraphEdge[] = rawEdges.map((e) => ({
    source: e.from,
    target: e.to,
    type: e.type,
  }));
  return { nodes: graphNodes, edges };
}

export async function listByLabel(
  label: string,
  limit = 100,
): Promise<BrowseEntity[]> {
  const nodes = await listBrainByType(label, limit);
  return nodes.map((n) => {
    const p = n.properties;
    const name =
      (p.name as string | undefined) ??
      (p.title as string | undefined) ??
      (typeof p.compiled === "string"
        ? (p.compiled as string).split("\n")[0].replace(/^#\s*/, "")
        : null) ??
      n.id;
    return { id: n.id, name, summary: null };
  });
}
