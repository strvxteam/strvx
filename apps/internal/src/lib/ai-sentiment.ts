import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface SentimentInput {
  companyName: string;
  engagementName: string;
  interactions: { type: string; content: string; date: string; author: string }[];
}

export interface SentimentResult {
  score: number; // 1-10, where 10 is very positive
  trend: "improving" | "stable" | "declining";
  summary: string;
  signals: string[];
  recommendation: string;
}

export async function analyzeSentiment(input: SentimentInput): Promise<SentimentResult> {
  const interactionText = input.interactions
    .slice(0, 20)
    .map((i) => `[${i.date}] ${i.author} (${i.type}): ${i.content.slice(0, 300)}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Analyze client sentiment for ${input.companyName} (engagement: ${input.engagementName}) based on these interactions:

${interactionText || "No interactions recorded."}

Respond in JSON only (no markdown fences):
{
  "score": <1-10 integer, 10=very positive>,
  "trend": "<improving|stable|declining>",
  "summary": "<1-2 sentence summary of client relationship health>",
  "signals": ["<key signal 1>", "<key signal 2>"],
  "recommendation": "<1 sentence actionable next step>"
}`,
    }],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "{}";

  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as SentimentResult;
  } catch {
    return {
      score: 5,
      trend: "stable",
      summary: "Unable to analyze — insufficient interaction data.",
      signals: [],
      recommendation: "Schedule a check-in call with the client.",
    };
  }
}
