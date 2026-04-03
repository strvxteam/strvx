export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  // Authenticate with API_KEY bearer token
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.API_KEY;

  if (!authHeader || !apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    let query = supabase
      .from("bookings")
      .select(`
        *,
        booking_members (
          member_id,
          team_members ( id, name, email )
        )
      `)
      .order("start_time", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("start_time", new Date(from).toISOString());
    if (to) query = query.lte("start_time", new Date(to).toISOString());

    const { data, error, count } = await query;

    if (error) {
      console.error("Failed to fetch bookings:", error);
      return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
    }

    return NextResponse.json({ bookings: data, total: count, limit, offset });
  } catch (err) {
    console.error("Bookings API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
