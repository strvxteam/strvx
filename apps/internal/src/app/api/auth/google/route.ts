import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, getDriveAuthUrl } from "@/lib/google-calendar";
import { DRIVE_SCOPES } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail } from "@/lib/queries";

export async function GET(request: NextRequest) {
  // Get the user before redirecting to Google
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const dbUser = await getUserByEmail(user.email);
  if (!dbUser) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/calendar";
  const isDrive = returnTo === "/assets";

  // Drive connections use a separate auth URL that forces account selection,
  // so the user can pick a different Google account than the one used for Calendar.
  const googleAuthUrl = isDrive ? getDriveAuthUrl(DRIVE_SCOPES) : getAuthUrl();
  const response = NextResponse.redirect(googleAuthUrl);

  const isSecure = process.env.NODE_ENV === "production";
  const cookieOpts = { httpOnly: true, secure: isSecure, sameSite: "lax" as const, maxAge: 600, path: "/" };

  response.cookies.set("google_auth_user_id", dbUser.id, cookieOpts);
  response.cookies.set("google_auth_return_to", returnTo, cookieOpts);
  response.cookies.set("google_auth_type", isDrive ? "drive" : "calendar", cookieOpts);

  return response;
}
