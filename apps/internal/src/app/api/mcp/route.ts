import { NextResponse } from "next/server";
import type { ToolDeps } from "@/lib/kg/mcp-tools";
import {
  handleMcpRequest,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/kg/mcp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.KG_MCP_API_KEY;
  let actor = "anonymous";
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (provided !== expected) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders() },
      );
    }
    actor = `mcp:${hashShort(provided)}`;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(jsonRpcError(null, -32700, "parse error"), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const deps: ToolDeps = { actor };

  if (Array.isArray(body)) {
    const results: JsonRpcResponse[] = [];
    for (const req of body) {
      const res = await handleMcpRequest(deps, req as JsonRpcRequest);
      if (res) results.push(res);
    }
    if (results.length === 0) {
      return new NextResponse(null, { status: 202, headers: corsHeaders() });
    }
    return NextResponse.json(results, { headers: corsHeaders() });
  }

  const res = await handleMcpRequest(deps, body as JsonRpcRequest);
  if (!res) {
    return new NextResponse(null, { status: 202, headers: corsHeaders() });
  }
  return NextResponse.json(res, { headers: corsHeaders() });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).slice(0, 8);
}
