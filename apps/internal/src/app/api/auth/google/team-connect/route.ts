// Initiates OAuth for the strvxteam@gmail.com Google Calendar account. The
// resulting refresh token gets stashed in the team_calendar_token DB row
// (see /api/auth/google/team-connect/callback). Lets ops connect the team
// account without touching Vercel env vars on the internal-tool project.

import { NextRequest, NextResponse } from "next/server";
import { getTeamCalendarAuthUrl } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Must be signed into the internal app first — prevents anyone from
  // hijacking the team calendar token via this route.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const authUrl = getTeamCalendarAuthUrl();
  const response = NextResponse.redirect(authUrl);

  // Flag this OAuth round-trip as "team" so the existing /api/auth/google/
  // callback knows to save to team_calendar_token instead of the per-user
  // google_tokens table.
  const isSecure = process.env.NODE_ENV === "production";
  response.cookies.set("google_auth_type", "team", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("google_auth_return_to", "/availability?team_connected=1", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
