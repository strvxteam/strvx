import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ProposalContext {
  companyName: string;
  companyIndustry: string | null;
  engagementName: string;
  stage: string;
  dealValue: number | null;
  contactName: string | null;
  contactEmail: string | null;
  recentInteractions: { type: string; content: string; date: string }[];
  existingProjects: { name: string; status: string }[];
}

export async function generateProposal(context: ProposalContext): Promise<string> {
  const interactionSummary = context.recentInteractions
    .slice(0, 10)
    .map((i) => `- [${i.type}] ${i.date}: ${i.content.slice(0, 200)}`)
    .join("\n");

  const projectList = context.existingProjects
    .map((p) => `- ${p.name} (${p.status})`)
    .join("\n");

  const prompt = `You are a proposal writer for strvx, a boutique AI development agency based in San Diego. We build internal AI tools, custom AI solutions, and provide ongoing maintenance for businesses.

Generate a professional project proposal based on this client context:

**Client:** ${context.companyName}
**Industry:** ${context.companyIndustry || "Not specified"}
**Engagement:** ${context.engagementName}
**Current Stage:** ${context.stage}
**Deal Value:** ${context.dealValue ? `$${context.dealValue.toLocaleString()}` : "TBD"}
**Contact:** ${context.contactName || "Unknown"}${context.contactEmail ? ` (${context.contactEmail})` : ""}

**Recent Interactions:**
${interactionSummary || "No interactions logged yet."}

**Existing Projects:**
${projectList || "None yet."}

Write a proposal in markdown that includes:
1. **Executive Summary** — 2-3 sentences on what we'll build and why
2. **Scope of Work** — Bullet points of deliverables
3. **Approach** — Our methodology (Discovery → MVP → Build → Deliver → Maintain)
4. **Timeline** — Estimated phases with durations
5. **Investment** — Pricing breakdown (use the deal value as a reference if available, otherwise suggest a range)
6. **Next Steps** — Clear call to action

Keep the tone professional but approachable. Be specific to their industry and needs based on the interaction history. Keep it concise — 1-2 pages max.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock?.text ?? "Failed to generate proposal.";
}
