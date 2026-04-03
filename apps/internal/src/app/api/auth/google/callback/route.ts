import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveGoogleTokens } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const returnTo = request.cookies.get("google_auth_return_to")?.value || "/calendar";

  if (error || !code) {
    return NextResponse.redirect(`${origin}${returnTo}?error=google_auth_denied`);
  }

  const userId = request.cookies.get("google_auth_user_id")?.value;
  if (!userId) {
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

    await saveGoogleTokens(userId, tokens);

    const response = NextResponse.redirect(`${origin}${returnTo}?connected=true`);
    response.cookies.delete("google_auth_user_id");
    response.cookies.delete("google_auth_return_to");
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Google OAuth] Callback error:", message);
    return NextResponse.redirect(
      `${origin}${returnTo}?error=${encodeURIComponent(message.slice(0, 100))}`
    );
  }
}
