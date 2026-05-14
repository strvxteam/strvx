import "server-only";

/**
 * Thin client for gbrain's HTTP MCP server.
 *
 * `gbrain serve --http --port 3131` runs the streaming MCP endpoint at /mcp.
 * It speaks JSON-RPC 2.0 framed as Server-Sent Events. Every response comes
 * back as one or more `event: message\ndata: <json>` chunks; the final chunk
 * carries the JSON-RPC result.
 *
 * Configure with:
 *   GBRAIN_MCP_URL=http://localhost:3131/mcp
 *   GBRAIN_MCP_TOKEN=<bearer token from `gbrain auth create`>
 *
 * If either is missing, every helper returns `null` so SIT falls back to
 * its direct filesystem reader (brain-reader.ts). gbrain being down is not
 * an emergency — the markdown is the source of truth.
 */

const URL_ENV = "GBRAIN_MCP_URL";
const TOKEN_ENV = "GBRAIN_MCP_TOKEN";

export function isGbrainConfigured(): boolean {
  return Boolean(process.env[URL_ENV] && process.env[TOKEN_ENV]);
}

interface JsonRpcResult {
  result?: unknown;
  error?: { code: number; message: string };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = process.env[URL_ENV];
  const token = process.env[TOKEN_ENV];
  if (!url || !token) return null;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      // gbrain refuses requests without both content types.
      accept: "application/json, text/event-stream",
    },
    body,
    signal,
  });
  if (!res.ok) {
    throw new Error(`gbrain MCP ${name}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const parsed = parseSseResult(text);
  if (parsed.error) {
    throw new Error(`gbrain MCP ${name}: ${parsed.error.message}`);
  }
  const r = parsed.result as
    | { content?: Array<{ type: string; text?: string }> }
    | undefined;
  const content = r?.content?.[0];
  if (!content || content.type !== "text" || !content.text) return null;
  // Tool results come back JSON-stringified inside the text field.
  try {
    return JSON.parse(content.text);
  } catch {
    return content.text;
  }
}

function parseSseResult(text: string): JsonRpcResult {
  // gbrain emits `event: message\ndata: <json>\n\n` per JSON-RPC message;
  // the LAST data line is the result we want.
  const lines = text.split("\n");
  let last: string | null = null;
  for (const line of lines) {
    const trimmed = line.replace(/^﻿/, "");
    if (trimmed.startsWith("data: ")) {
      last = trimmed.slice(6);
    } else if (trimmed.startsWith("data:")) {
      last = trimmed.slice(5).trim();
    }
  }
  if (!last) return { error: { code: -1, message: "no SSE data frame" } };
  try {
    return JSON.parse(last) as JsonRpcResult;
  } catch {
    return { error: { code: -1, message: "malformed SSE data frame" } };
  }
}

export interface GbrainSearchHit {
  /** gbrain slug, e.g. "people/jane-doe". */
  slug: string;
  /** gbrain entity type, e.g. "person", "company", "deal". */
  type: string | null;
  /** Truncated chunk text matched by the search. */
  chunk_text: string | null;
  /** Relevance score (higher = better; gbrain's RRF). */
  score: number | null;
}

/**
 * Hybrid (RRF) search via gbrain. Returns `null` if gbrain isn't configured
 * or is unreachable — caller should fall back to its own reader.
 */
export async function gbrainSearch(
  query: string,
  limit = 20,
): Promise<GbrainSearchHit[] | null> {
  if (!isGbrainConfigured()) return null;
  try {
    const out = await callTool("search", { query, limit });
    if (!Array.isArray(out)) return null;
    return out.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        slug: String(r.slug ?? ""),
        type: typeof r.type === "string" ? r.type : null,
        chunk_text:
          typeof r.chunk_text === "string" ? r.chunk_text : null,
        score: typeof r.score === "number" ? r.score : null,
      };
    });
  } catch {
    return null;
  }
}
