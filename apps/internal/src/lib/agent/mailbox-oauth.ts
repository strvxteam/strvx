import { google, type Auth } from "googleapis";
import { eq, sql } from "drizzle-orm";
import { db as defaultDb, mailboxOauthTokens } from "@strvx/db";
import { decrypt, encrypt, getEncryptionKey } from "./encryption";

export type MailboxRow = {
  id: string;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expiry_date: number;
  scopes: string[];
  is_active: boolean;
};

/**
 * Threshold of consecutive transient refresh failures before we
 * disable the mailbox. Definitive failures (invalid_grant /
 * token revoked / invalid_token) flip immediately on first hit.
 */
export const REFRESH_FAILURE_DISABLE_THRESHOLD = 5;

/**
 * Substrings that, when present in the error message returned by
 * google's OAuth refresh, indicate a definitive (non-retryable)
 * failure. We map any of these to "disconnected" and disable the
 * mailbox immediately.
 */
const DEFINITIVE_REFRESH_ERROR_MARKERS = [
  "invalid_grant",
  "token has been expired or revoked",
  "invalid_token",
  "unauthorized_client",
] as const;

export type RefreshErrorKind = "definitive" | "transient";

export function classifyRefreshError(error: unknown): RefreshErrorKind {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  for (const marker of DEFINITIVE_REFRESH_ERROR_MARKERS) {
    if (lower.includes(marker)) return "definitive";
  }
  return "transient";
}

/**
 * Pure, testable: builds a Google OAuth2 client for a mailbox row.
 * No DB / no network. Decrypts tokens and sets credentials.
 *
 * Throws on:
 *   - missing OAUTH_TOKEN_ENCRYPTION_KEY
 *   - missing Google OAuth env (CLIENT_ID/SECRET/REDIRECT_URI)
 *   - inactive mailbox
 */
export function buildOAuthClientFromRow(row: MailboxRow) {
  if (!row.is_active) {
    throw new Error(`Mailbox ${row.email} is inactive`);
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set");
  }
  const key = getEncryptionKey();
  const accessToken = decrypt(row.access_token_encrypted, key);
  const refreshToken = decrypt(row.refresh_token_encrypted, key);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: row.expiry_date,
  });
  return oauth2Client;
}

/**
 * Records a refresh failure on a mailbox row.
 *
 * For "definitive" errors (invalid_grant, token revoked, etc.) we
 * flip is_active off immediately so downstream callers / the UI
 * disconnect banner can react.
 *
 * For "transient" errors we just bump the counter and stamp the
 * message; once the count crosses REFRESH_FAILURE_DISABLE_THRESHOLD
 * we also flip is_active off (assumes a persistent problem we can no
 * longer chalk up to network blips).
 *
 * Exported for callers that want to record a refresh failure
 * surfaced by their own Gmail/Calendar call (since googleapis
 * doesn't emit a single canonical "refresh failed" event).
 */
export async function markMailboxRefreshFailure(args: {
  mailboxId: string;
  error: unknown;
  db?: typeof defaultDb;
  threshold?: number;
}): Promise<{
  disabled: boolean;
  kind: RefreshErrorKind;
  failureCount: number;
}> {
  const db = args.db ?? defaultDb;
  const threshold = args.threshold ?? REFRESH_FAILURE_DISABLE_THRESHOLD;
  const kind = classifyRefreshError(args.error);
  const errorMessage =
    args.error instanceof Error
      ? args.error.message
      : String(args.error ?? "unknown");

  const [updated] = await db
    .update(mailboxOauthTokens)
    .set({
      refreshFailureCount: sql`${mailboxOauthTokens.refreshFailureCount} + 1`,
      lastRefreshError: errorMessage.slice(0, 1000),
      lastRefreshErrorAt: new Date(),
      isActive:
        kind === "definitive"
          ? false
          : sql`(${mailboxOauthTokens.refreshFailureCount} + 1) < ${threshold}`,
      updatedAt: new Date(),
    })
    .where(eq(mailboxOauthTokens.id, args.mailboxId))
    .returning({
      isActive: mailboxOauthTokens.isActive,
      refreshFailureCount: mailboxOauthTokens.refreshFailureCount,
    });

  const failureCount = updated?.refreshFailureCount ?? 0;
  const disabled =
    kind === "definitive" || (updated?.isActive === false);

  return { disabled, kind, failureCount };
}

/**
 * Clears recorded refresh errors after a successful credential
 * refresh, so a single recovery resets the consecutive-failure
 * counter.
 */
async function clearRefreshFailureState(
  db: typeof defaultDb,
  mailboxId: string
): Promise<void> {
  await db
    .update(mailboxOauthTokens)
    .set({
      refreshFailureCount: 0,
      lastRefreshError: null,
      lastRefreshErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(mailboxOauthTokens.id, mailboxId));
}

/**
 * Loads a mailbox by id and returns an authed OAuth2 client + the mailbox email.
 * Sets up a `tokens` event listener that re-encrypts and persists refreshed
 * credentials to the DB. Mirrors the existing per-user pattern in
 * src/lib/google-calendar.ts.
 *
 * Throws when the mailbox row is missing or marked inactive. Use
 * {@link getAuthedMailboxClientSafe} for a non-throwing variant that
 * callers can branch on (e.g. cron jobs that want to log + skip
 * rather than blow up the whole batch).
 */
export async function getAuthedMailboxClient(mailboxId: string) {
  const db = defaultDb;
  const [row] = await db
    .select()
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.id, mailboxId))
    .limit(1);

  if (!row) {
    throw new Error(`Mailbox ${mailboxId} not found`);
  }

  const mailboxRow: MailboxRow = {
    id: row.id,
    email: row.email,
    access_token_encrypted: row.accessTokenEncrypted,
    refresh_token_encrypted: row.refreshTokenEncrypted,
    expiry_date: row.expiryDate,
    scopes: row.scopes,
    is_active: row.isActive,
  };

  const oauth2Client = buildOAuthClientFromRow(mailboxRow);

  oauth2Client.on("tokens", async (tokens: Auth.Credentials) => {
    const key = getEncryptionKey();
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      // A successful refresh clears any previously-recorded failure
      // state — counter resets so transient blips don't accumulate
      // toward the disable threshold.
      refreshFailureCount: 0,
      lastRefreshError: null,
      lastRefreshErrorAt: null,
    };
    if (tokens.access_token) {
      updates.accessTokenEncrypted = encrypt(tokens.access_token, key);
    }
    if (tokens.refresh_token) {
      updates.refreshTokenEncrypted = encrypt(tokens.refresh_token, key);
    }
    if (tokens.expiry_date) {
      updates.expiryDate = tokens.expiry_date;
    }
    await db
      .update(mailboxOauthTokens)
      .set(updates)
      .where(eq(mailboxOauthTokens.id, mailboxId));
  });

  return { client: oauth2Client, email: row.email };
}

export type SafeMailboxClientError = "not_found" | "disconnected" | "transient";

export type SafeMailboxClient =
  | {
      ok: true;
      client: Awaited<ReturnType<typeof getAuthedMailboxClient>>["client"];
      email: string;
    }
  | {
      ok: false;
      error: SafeMailboxClientError;
      message: string;
    };

/**
 * Substrings in a thrown error from buildOAuthClientFromRow / the DB
 * read that indicate the mailbox itself is unhealthy (encryption keys
 * gone, row tampering, definitive refresh markers). Anything else is
 * classified "transient" so the caller can retry.
 */
const DISCONNECT_ERROR_MARKERS = [
  "inactive",
  "encryption",
  "oauth_token_encryption_key",
  "google_client_id",
  "google_client_secret",
  ...DEFINITIVE_REFRESH_ERROR_MARKERS,
] as const;

function classifySafeClientError(err: unknown): "disconnected" | "transient" {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  for (const marker of DISCONNECT_ERROR_MARKERS) {
    if (msg.includes(marker)) return "disconnected";
  }
  return "transient";
}

/**
 * Non-throwing variant of {@link getAuthedMailboxClient}. Returns a
 * discriminated union so callers can log + skip on missing /
 * disconnected mailboxes rather than crashing the batch.
 *
 * Result shape:
 *   - `not_found`     → mailbox row absent (likely deleted)
 *   - `disconnected`  → mailbox row exists but is_active = false, OR
 *                       construction failed in a way that maps to a
 *                       definitive auth/config problem
 *   - `transient`     → DB / network blip during the read or any other
 *                       error a retry might recover from
 *
 * Note: this does NOT pre-empt token-refresh failures — those only
 * surface when an actual Gmail/Calendar API call is made. Callers
 * should additionally wrap their first API call with try/catch and
 * call {@link markMailboxRefreshFailure} on auth-shaped errors.
 */
export async function getAuthedMailboxClientSafe(
  mailboxId: string
): Promise<SafeMailboxClient> {
  let row;
  try {
    [row] = await defaultDb
      .select({
        id: mailboxOauthTokens.id,
        email: mailboxOauthTokens.email,
        isActive: mailboxOauthTokens.isActive,
        lastRefreshError: mailboxOauthTokens.lastRefreshError,
      })
      .from(mailboxOauthTokens)
      .where(eq(mailboxOauthTokens.id, mailboxId))
      .limit(1);
  } catch (err) {
    return {
      ok: false,
      error: "transient",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!row) {
    return {
      ok: false,
      error: "not_found",
      message: `Mailbox ${mailboxId} not found`,
    };
  }
  if (!row.isActive) {
    return {
      ok: false,
      error: "disconnected",
      message:
        row.lastRefreshError ?? `Mailbox ${row.email} is inactive`,
    };
  }

  try {
    const result = await getAuthedMailboxClient(mailboxId);
    return { ok: true, client: result.client, email: result.email };
  } catch (err) {
    return {
      ok: false,
      error: classifySafeClientError(err),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Re-exported for tests / dependency injection.
 */
export { clearRefreshFailureState };
