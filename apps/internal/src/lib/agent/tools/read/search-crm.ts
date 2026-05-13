import { ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { companies, contacts, engagements } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  query: z.string().min(1),
});

export const searchCrmTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "search_crm",
  description:
    "Top-5 fuzzy text matches across companies, contacts, and engagements. Use to find the engagement related to a thread when the sender email doesn't match exactly.",
  inputSchema,
  async handle(input, ctx) {
    const pattern = `%${input.query}%`;

    const matchingCompanies = await ctx.db
      .select({ id: companies.id, name: companies.name, kind: sql<string>`'company'` })
      .from(companies)
      .where(ilike(companies.name, pattern))
      .limit(5);

    const matchingContacts = await ctx.db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        kind: sql<string>`'contact'`,
      })
      .from(contacts)
      .where(or(ilike(contacts.name, pattern), ilike(contacts.email, pattern)))
      .limit(5);

    const matchingEngagements = await ctx.db
      .select({
        id: engagements.id,
        name: engagements.name,
        stage: engagements.stage,
        kind: sql<string>`'engagement'`,
      })
      .from(engagements)
      .where(ilike(engagements.name, pattern))
      .limit(5);

    return {
      companies: matchingCompanies,
      contacts: matchingContacts,
      engagements: matchingEngagements,
    };
  },
};
