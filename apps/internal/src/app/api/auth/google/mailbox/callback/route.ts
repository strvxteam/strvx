import { NextRequest } from "next/server";
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
  const returnTo = returnCookie
    ? decodeURIComponent(returnCookie)
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
  return response;
}
