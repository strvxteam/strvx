import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { mailboxOauthTokens } from "@/lib/db/schema";

export type DisconnectedMailbox = {
  id: string;
  email: string;
};

/**
 * Returns the list of mailbox OAuth rows that have `is_active = false`.
 * Used by the /agent and /agent-inbox layouts to surface a reconnect
 * banner. Returns [] when all mailboxes are healthy.
 */
export async function fetchDisconnectedMailboxes(
  db: typeof defaultDb = defaultDb
): Promise<DisconnectedMailbox[]> {
  const rows = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
    })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, false));
  return rows;
}
