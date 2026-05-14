import "server-only";
import {
  getBrainNode,
  getBrainContext,
  searchBrain,
  listBrainByType,
  type BrainNode,
} from "./brain-reader";

/**
 * The MCP tool surface SIT exposes to its internal agent. Before the gbrain
 * migration this layer wrapped @strvx/kg + Neo4j. Now it reads from the
 * markdown brain at /brain/ directly. The tool names + shapes are kept
 * stable so any agent already wired against /api/mcp keeps working.
 *
 * Once we stand up gbrain's own HTTP MCP server (`gbrain serve --http`),
 * the user's internal agent can point at it directly and bypass this
 * shim entirely.
 */

export interface ToolDeps {
  /** Actor label, used for logging. The brain reader is stateless so we
   * don't need real clients here anymore. */
  actor: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke(deps: ToolDeps, args: Record<string, unknown>): Promise<unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: "kg_search",
    description:
      "Substring + scoring search across the strvx brain (markdown corpus). Covers People, Organizations, Deals, Projects, Meetings, Finances. Match is case-insensitive against slug + frontmatter name + page body. Use single distinctive keywords. Returns top-k matches with their nodes and a relevance score.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Free-text search string." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
    },
    async invoke(_deps, args) {
      const query = String(args.query);
      const limit = clampInt(args.limit, 1, 50, 10);
      return searchBrain(query, limit);
    },
  },
  {
    name: "kg_get_node",
    description:
      "Fetch a single brain page by slug (e.g., 'people/jane-doe', 'companies/acme', 'deals/acme-q4-platform'). Returns the page node with frontmatter, compiled-truth body, and timeline. Null if not found.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "brain slug" } },
    },
    async invoke(_deps, args) {
      return getBrainNode(String(args.id));
    },
  },
  {
    name: "kg_get_entity_context",
    description:
      "Rich snapshot of an entity: the page + everything reachable through wikilinks within `depth` hops. Use this for 'tell me about X' or 'what's connected to X'.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        depth: { type: "integer", minimum: 1, maximum: 4, default: 2 },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
    },
    async invoke(_deps, args) {
      return getBrainContext(
        String(args.id),
        clampInt(args.depth, 1, 4, 2),
        clampInt(args.limit, 1, 200, 50),
      );
    },
  },
  {
    name: "kg_list_by_type",
    description:
      "List brain pages of a given type. Type is one of Person, Organization, Engagement, Interaction, FinancialEvent, Note.",
    inputSchema: {
      type: "object",
      required: ["type"],
      properties: {
        type: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 50 },
      },
    },
    async invoke(_deps, args): Promise<BrainNode[]> {
      return listBrainByType(
        String(args.type),
        clampInt(args.limit, 1, 500, 50),
      );
    },
  },
];

function clampInt(
  v: unknown,
  min: number,
  max: number,
  defaultVal: number,
): number {
  const n = typeof v === "number" ? v : v === undefined ? defaultVal : Number(v);
  if (!Number.isFinite(n)) return defaultVal;
  const r = Math.floor(n);
  if (r < min) return min;
  if (r > max) return max;
  return r;
}
