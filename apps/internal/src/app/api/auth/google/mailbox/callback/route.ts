import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db, mailboxOauthTokens } from "@strvx/db";
import { encrypt, getEncryptionKey } from "@/lib/agent/encryption";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback for the mailbox connection flow.
 * Exchanges code → tokens, fetches the mailbox email, encrypts tokens, upserts.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return Response.redirect(
      `${request.nextUrl.origin}/agent/settings?tab=mailboxes&error=${encodeURIComponent(error)}`,
      302
    );
  }
  if (!code) {
    return Response.json({ error: "Missing code" }, { status: 400 });
  }

  // CSRF state check: the `state` parameter Google echoed back must match
  // the HttpOnly cookie we set in the initiate route. Use constant-time
  // comparison to avoid leaking the nonce via timing.
  const stateParam = request.nextUrl.searchParams.get("state") ?? "";
  const stateCookie = request.cookies.get("mailbox_oauth_state")?.value ?? "";
  if (!stateParam || !stateCookie || !constantTimeEqual(stateParam, stateCookie)) {
    return failClosed(request, "state_mismatch");
  }

  // Initiator binding: the session user that lands on the callback must
  // be the same user that started the flow. Stops an attacker from
  // hijacking the round-trip and binding their mailbox to a different
  // admin's session.
  const initiatorCookie = request.cookies.get("mailbox_oauth_initiated_by")
    ?.value;
  const initiatorId = initiatorCookie
    ? decodeURIComponent(initiatorCookie)
    : "";
  if (!initiatorId || initiatorId !== user.id) {
    return failClosed(request, "initiator_mismatch");
  }

  const redirectUri = `${request.nextUrl.origin}/api/auth/google/mailbox/callback`;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  let tokens;
  try {
    const result = await oauth2Client.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    console.error("[mailbox-oauth-callback] Token exchange failed", err);
    return Response.redirect(
      `${request.nextUrl.origin}/agent/settings?tab=mailboxes&error=token_exchange_failed`,
      302
    );
  }

  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    return Response.json(
      { error: "Incomplete token response from Google" },
      { status: 500 }
    );
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userinfo = await oauth2.userinfo.get();
  const mailboxEmail = userinfo.data.email;
  const displayName = userinfo.data.name ?? null;

  if (!mailboxEmail) {
    return Response.json(
      { error: "Could not determine mailbox email from Google" },
      { status: 500 }
    );
  }

  const key = getEncryptionKey();
  const accessEnc = encrypt(tokens.access_token, key);
  const refreshEnc = encrypt(tokens.refresh_token, key);
  const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);

  const [existing] = await db
    .select()
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.email, mailboxEmail))
    .limit(1);

  if (existing) {
    await db
      .update(mailboxOauthTokens)
      .set({
        accessTokenEncrypted: accessEnc,
        refreshTokenEncrypted: refreshEnc,
        expiryDate: tokens.expiry_date,
        scopes,
        displayName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(mailboxOauthTokens.id, existing.id));
  } else {
    await db.insert(mailboxOauthTokens).values({
      email: mailboxEmail,
      displayName,
      accessTokenEncrypted: accessEnc,
      refreshTokenEncrypted: refreshEnc,
      expiryDate: tokens.expiry_date,
      scopes,
      connectedByUserId: user.id,
    });
  }

  const returnCookie = request.cookies.get("mailbox_oauth_return_to")?.value;
  const decoded = returnCookie
    ? decodeURIComponent(returnCookie)
    : "/agent/settings?tab=mailboxes";
  // Sanitize: only allow a same-origin relative path. Anything else falls
  // back to the default — protects against an open-redirect where a planted
  // cookie like `//evil.com/path` or `\\evil.com` would otherwise send the
  // user off-domain after a successful OAuth round-trip.
  const returnTo = isSafeRelativePath(decoded)
    ? decoded
    : "/agent/settings?tab=mailboxes";

  const separator = returnTo.includes("?") ? "&" : "?";
  const response = Response.redirect(
    `${request.nextUrl.origin}${returnTo}${separator}connected=${encodeURIComponent(mailboxEmail)}`,
    302
  );
  response.headers.append(
    "Set-Cookie",
    "mailbox_oauth_return_to=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  response.headers.append(
    "Set-Cookie",
    "mailbox_oauth_initiated_by=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  response.headers.append(
    "Set-Cookie",
    "mailbox_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  return response;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Reject the round-trip and redirect back to the Mailboxes tab with a
 * specific error code. Also clears the round-trip cookies so a retried
 * flow starts clean.
 */
function failClosed(request: NextRequest, reason: string): Response {
  const response = Response.redirect(
    `${request.nextUrl.origin}/agent/settings?tab=mailboxes&error=${encodeURIComponent(reason)}`,
    302
  );
  response.headers.append(
    "Set-Cookie",
    "mailbox_oauth_return_to=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  response.headers.append(
    "Set-Cookie",
    "mailbox_oauth_initiated_by=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  response.headers.append(
    "Set-Cookie",
    "mailbox_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  return response;
}

/**
 * Accept only relative paths that start with exactly one `/`, contain no
 * scheme, no authority component, and no backslash. Rejects `//host/x`,
 * `/\\host`, `https://host`, and `javascript:` payloads.
 */
function isSafeRelativePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (value.includes("\\")) return false;
  // Anything that parses as an absolute URL is rejected.
  try {
    new URL(value);
    return false;
  } catch {
    return true;
  }
}
