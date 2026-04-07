import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { portalTokens, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getPortalCompany() {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_token")?.value;
  if (!token) return null;

  const [portalToken] = await db
    .select({ companyId: portalTokens.companyId, contactEmail: portalTokens.contactEmail, expiresAt: portalTokens.expiresAt })
    .from(portalTokens)
    .where(eq(portalTokens.token, token));

  if (!portalToken) return null;
  if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) return null;

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, portalToken.companyId));

  return company ? { ...company, contactEmail: portalToken.contactEmail } : null;
}
