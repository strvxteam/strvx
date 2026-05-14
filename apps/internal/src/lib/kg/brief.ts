import "server-only";
import OpenAI from "openai";
import { TOOLS, type ToolDeps } from "./mcp-tools";

const MODEL = process.env.KG_BRIEF_MODEL ?? "gpt-4o";
const MAX_TURNS = 10;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set — add it to .env.local to generate briefs.");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const SYSTEM_PROMPT = `You are the strvx pre-meeting brief writer. Given a single entity (Person, Organization, or Engagement) and the kg_* tools, produce a tight markdown brief someone can scan in <30 seconds before a meeting.

Always use the tools. Never make up facts. Default to mode:"structured" on kg_search — hybrid often returns empty since embeddings are sparse.

Brief structure (markdown):
## Snapshot
One sentence: who/what this is, current status.

## Connections
Bullets of the most-relevant related entities. Cite ids inline as (postgres:...).

## Recent activity
Bullets of the 3-5 most recent Interactions/Tasks/Notes touching this entity. Date + one-line summary each.

## Open obligations
Tasks not yet completed tied to this entity. Cite ids.

## Watch for
1-3 things to bring up or be aware of in the meeting. Specific. Grounded in the graph.

Rules:
- Plain markdown, no code fences around the whole brief.
- If a section is empty, write a single italicized _Nothing surfaced._ line (use underscores, not asterisks).
- Keep total length under 250 words.
- Today's date is 2026-05-13.`;

export async function generateBrief(entityId: string): Promise<string> {
  const openai = getOpenAI();
  const deps: ToolDeps = { actor: "sit:kg-brief" };

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as OpenAI.FunctionParameters,
    },
  }));

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate a pre-meeting brief for entity id: ${entityId}\n\nStart by calling kg_get_node to confirm the entity exists, then kg_get_entity_context with depth 2 for relationships, then any follow-ups you need to fill the sections.`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      // Force the first turn to call a tool — the brief must be grounded.
      tool_choice: turn === 0 ? "required" : "auto",
    });

    const choice = resp.choices[0];
    if (!choice) return "_No response from model._";
    const msg = choice.message;
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return (msg.content ?? "").trim();
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const tool = TOOLS.find((t) => t.name === call.function.name);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `error: unknown tool ${call.function.name}`,
        });
        continue;
      }
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // pass empty args
      }
      try {
        const result = await tool.invoke(deps, args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result, neo4jReplacer).slice(0, 12000),
        });
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `error: ${(err as Error).message}`,
        });
      }
    }
  }

  return "_Brief generation timed out after reaching the tool-call limit._";
}

function neo4jReplacer(_key: string, value: unknown): unknown {
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
