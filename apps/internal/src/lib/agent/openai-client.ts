import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Lazily-initialised singleton OpenAI client. Reads OPENAI_API_KEY at first use.
 */
export function getOpenAI(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not set. Add it to .env.local."
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Prompt blocks the agent assembles, tagged by cache tier so we can keep the
 * stable prefix at the front of the input array for OpenAI's automatic prefix
 * caching to maximise hit rate.
 *
 * Order from most-stable to most-variable:
 *   stable-system    → invariant agent persona + rules
 *   stable-tools     → tool definitions (rarely change between deploys)
 *   stable-snapshot  → CRM context bootstrap (refreshed weekly)
 *   variable         → per-call thread content, classification result, tool results
 */
export type CacheTier =
  | "stable-system"
  | "stable-tools"
  | "stable-snapshot"
  | "variable";

export type PromptBlock = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  cacheTier: CacheTier;
};

const TIER_ORDER: Record<CacheTier, number> = {
  "stable-system": 0,
  "stable-tools": 1,
  "stable-snapshot": 2,
  variable: 3,
};

/**
 * Returns the blocks in cache-friendly order. Stable order within tier.
 */
export function composeCacheFriendlyInput(blocks: PromptBlock[]): PromptBlock[] {
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const t = TIER_ORDER[x.b.cacheTier] - TIER_ORDER[y.b.cacheTier];
      return t !== 0 ? t : x.i - y.i;
    })
    .map(({ b }) => b);
}

/**
 * Model identifiers used by the agent. Centralised so we can swap models
 * without grepping every callsite.
 */
export const MODELS = {
  classify: "gpt-5-mini",
  reasoning: "gpt-5",
  brief: "gpt-5",
  capture: "gpt-5-mini",
} as const;
