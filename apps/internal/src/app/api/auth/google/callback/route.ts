import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  saveGoogleTokens,
  saveDriveTokens,
  saveTeamRefreshToken,
} from "@/lib/google-calendar";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const returnTo = request.cookies.get("google_auth_return_to")?.value || "/calendar";
  const authType = request.cookies.get("google_auth_type")?.value || "calendar";

  if (error || !code) {
    return NextResponse.redirect(`${origin}${returnTo}?error=google_auth_denied`);
  }

  // The "team" flow doesn't use the google_auth_user_id cookie — the resulting
  // token is shared across the workspace, not bound to one user row. Other
  // flows still require a user id.
  const userId =
    authType === "team"
      ? null
      : request.cookies.get("google_auth_user_id")?.value;
  if (authType !== "team" && !userId) {
    return NextResponse.redirect(`${origin}${returnTo}?error=session_expired`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      console.error("[Google OAuth] Missing tokens:", JSON.stringify({
        has_access: !!tokens.access_token,
        has_refresh: !!tokens.refresh_token,
        has_expiry: !!tokens.expiry_date,
      }));
      return NextResponse.redirect(`${origin}${returnTo}?error=missing_tokens`);
    }

    if (authType === "team") {
      // Record which Google account the OAuth round-trip connected. Non-fatal
      // if userinfo fails — we still save the token.
      let connectedEmail: string | null = null;
      try {
        const oauth2 = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI,
        );
        oauth2.setCredentials({ access_token: tokens.access_token });
        const info = await google.oauth2({ version: "v2", auth: oauth2 }).userinfo.get();
        connectedEmail = info.data.email ?? null;
      } catch {
        // ignore
      }
      await saveTeamRefreshToken(tokens.refresh_token, connectedEmail);
    } else if (authType === "drive" && userId) {
      await saveDriveTokens(userId, tokens);
    } else if (userId) {
      await saveGoogleTokens(userId, tokens);
    }

    const response = NextResponse.redirect(`${origin}${returnTo}?connected=true`);
    response.cookies.delete("google_auth_user_id");
    response.cookies.delete("google_auth_return_to");
    response.cookies.delete("google_auth_type");
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Google OAuth] Callback error:", message);
    return NextResponse.redirect(
      `${origin}${returnTo}?error=${encodeURIComponent(message.slice(0, 100))}`
    );
  }
}
