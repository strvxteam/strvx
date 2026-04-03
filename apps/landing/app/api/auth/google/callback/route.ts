export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { users } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
import { handleOAuthCallback } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const memberId = searchParams.get("state");
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
      console.warn(`No refresh_token for member ${memberId}. User may need to revoke access and reconnect.`);
      return NextResponse.redirect(new URL("/admin/calendar-connected?error=no_refresh_token", request.url));
    }

    await db
      .update(users)
      .set({ googleRefreshToken: tokens.refresh_token })
      .where(eq(users.id, memberId));

    return NextResponse.redirect(new URL("/admin/calendar-connected?success=true", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/admin/calendar-connected?error=server_error", request.url));
  }
}
