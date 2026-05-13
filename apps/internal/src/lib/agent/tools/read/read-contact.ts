import { and, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { contacts, companies, engagements } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  email_or_id: z.string().min(1),
});

export const readContactTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "read_contact",
  description:
    "Looks up a contact by email (preferred) or contact id. Returns the contact + their company + all engagements they're on.",
  inputSchema,
  async handle(input, ctx) {
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(input.email_or_id);
    const where = looksLikeUuid
      ? eq(contacts.id, input.email_or_id)
      : ilike(contacts.email, input.email_or_id);

    const [contact] = await ctx.db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        role: contacts.role,
        companyId: contacts.companyId,
      })
      .from(contacts)
      .where(where)
      .limit(1);

    if (!contact) return { error: "contact_not_found" };

    const [company] = await ctx.db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, contact.companyId))
      .limit(1);

    const contactEngagements = await ctx.db
      .select({
        id: engagements.id,
        name: engagements.name,
        stage: engagements.stage,
      })
      .from(engagements)
      .where(
        and(
          eq(engagements.primaryContactId, contact.id),
          isNull(engagements.archivedAt)
        )
      );

    return { contact, company, engagements: contactEngagements };
  },
};
