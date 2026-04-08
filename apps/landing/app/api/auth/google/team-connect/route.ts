export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

// Admin-only endpoint to re-authenticate the strvxteam@gmail.com calendar account.
// Visit: /api/auth/google/team-connect?secret=<ADMIN_SECRET>
// After authorizing, copy the refresh token shown and update GOOGLE_TEAM_REFRESH_TOKEN in Vercel.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const secret = searchParams.get("secret");

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the special "TEAM_CALENDAR" state — the callback will handle it separately
  const url = getAuthUrl("TEAM_CALENDAR");
  return NextResponse.redirect(url);
}
