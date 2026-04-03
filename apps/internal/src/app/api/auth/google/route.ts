import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";
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

  // Check if this is a Drive connection request (include Drive scopes)
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/calendar";
  const extraScopes = returnTo === "/assets" ? DRIVE_SCOPES : [];

  const googleAuthUrl = getAuthUrl(extraScopes);
  const response = NextResponse.redirect(googleAuthUrl);

  const isSecure = process.env.NODE_ENV === "production";

  response.cookies.set("google_auth_user_id", dbUser.id, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  response.cookies.set("google_auth_return_to", returnTo, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
