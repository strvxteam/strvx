export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { handleOAuthCallback } from "@/lib/google-calendar";

// Google OAuth callback — exchanges auth code for tokens and saves refresh_token
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const memberId = searchParams.get("state"); // state = memberId, set in getAuthUrl
  const errorParam = searchParams.get("error");

  if (errorParam) {
    console.error("OAuth error from Google:", errorParam);
    return NextResponse.redirect(new URL("/admin/calendar-connected?error=oauth_denied", request.url));
  }

  if (!code || !memberId) {
    return NextResponse.redirect(new URL("/admin/calendar-connected?error=missing_params", request.url));
  }

  try {
    const tokens = await handleOAuthCallback(code);

    if (!tokens.refresh_token) {
      // Can happen if the user already granted access — they need to revoke and re-authorize
      console.warn(`No refresh_token for member ${memberId}. User may need to revoke access and reconnect.`);
      return NextResponse.redirect(new URL("/admin/calendar-connected?error=no_refresh_token", request.url));
    }

    const { error } = await supabase
      .from("team_members")
      .update({ google_refresh_token: tokens.refresh_token })
      .eq("id", memberId);

    if (error) {
      console.error("Failed to save refresh token:", error);
      return NextResponse.redirect(new URL("/admin/calendar-connected?error=save_failed", request.url));
    }

    return NextResponse.redirect(new URL("/admin/calendar-connected?success=true", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/admin/calendar-connected?error=server_error", request.url));
  }
}
