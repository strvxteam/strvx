export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthUrl } from "@/lib/google-calendar";

// Internal-only route — protected by ADMIN_SECRET query param
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const secret = searchParams.get("secret");

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberId = searchParams.get("memberId");

  // If memberId provided, redirect to OAuth URL for that member
  if (memberId) {
    const url = getAuthUrl(memberId);
    return NextResponse.redirect(url);
  }

  // Otherwise, return all members with connection status + OAuth URLs
  const { data: members, error } = await supabase
    .from("team_members")
    .select("id, name, email, google_refresh_token, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }

  const result = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    connected: !!m.google_refresh_token,
    connectUrl: m.google_refresh_token
      ? null
      : `/api/auth/google/connect?secret=${secret}&memberId=${m.id}`,
  }));

  return NextResponse.json({ members: result });
}
