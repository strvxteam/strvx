import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";

/**
 * Initiates the OAuth flow for connecting a shared mailbox (team@strvx.com,
 * strvxteam@gmail.com, etc.) to the agent.
 *
 * Distinct from /api/auth/google which connects a user's personal Calendar/Drive.
 * Scopes: gmail.modify + gmail.send + calendar.readonly + calendar.events
 *       + userinfo.{email,profile}.
 *
 * Admin-gated: requires an authenticated @strvx.com session.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email?.endsWith("@strvx.com")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json(
      { error: "Google OAuth not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/auth/google/mailbox/callback`;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  const scopes = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];
  // CSRF state nonce — 32 random bytes, base64url. Stored in an HttpOnly
  // cookie and echoed back via the OAuth `state` parameter. The callback
  // rejects the round-trip unless cookie === state AND the current
  // session user matches the user that initiated the flow.
  const stateNonce = randomBytes(32).toString("base64url");

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    include_granted_scopes: true,
    state: stateNonce,
  });

  const returnTo =
    request.nextUrl.searchParams.get("return_to") ??
    "/agent/settings?tab=mailboxes";
  const response = Response.redirect(url, 302);
  const cookieFlags = "Path=/; HttpOnly; SameSite=Lax; Max-Age=600";
  const secureFlag =
    request.nextUrl.protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `mailbox_oauth_return_to=${encodeURIComponent(returnTo)}; ${cookieFlags}${secureFlag}`
  );
  response.headers.append(
    "Set-Cookie",
    `mailbox_oauth_initiated_by=${encodeURIComponent(user.id)}; ${cookieFlags}${secureFlag}`
  );
  response.headers.append(
    "Set-Cookie",
    `mailbox_oauth_state=${stateNonce}; ${cookieFlags}${secureFlag}`
  );
  return response;
}
