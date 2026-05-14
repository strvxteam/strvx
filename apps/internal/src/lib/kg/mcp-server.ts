import "server-only";
import { TOOLS, type ToolDeps } from "./mcp-tools";

const PROTOCOL_VERSION = "2024-11-05";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export async function handleMcpRequest(
  deps: ToolDeps,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined;
  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "initialize": {
        if (isNotification) return null;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "strvx-sit-kg", version: "0.0.1" },
          },
        };
      }
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress": {
        return null;
      }
      case "tools/list": {
        if (isNotification) return null;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        };
      }
      case "tools/call": {
        if (isNotification) return null;
        const params = req.params ?? {};
        const name = String(params.name);
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `unknown tool: ${name}` },
          };
        }
        try {
          const result = await tool.invoke(deps, args);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                { type: "text", text: JSON.stringify(result, replacer) },
              ],
            },
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [
                { type: "text", text: `tool error: ${(err as Error).message}` },
              ],
            },
          };
        }
      }
      default: {
        if (isNotification) return null;
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `method not found: ${req.method}` },
        };
      }
    }
  } catch (err) {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: `internal error: ${(err as Error).message}` },
    };
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object") {
    const v = value as { toNumber?: () => number; toString?: () => string };
    if (typeof v.toNumber === "function") {
      const n = v.toNumber();
      return Number.isSafeInteger(n) ? n : v.toString?.() ?? String(value);
    }
  }
  return value;
}
