export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { syncSupabaseProjects } from "@/lib/dev-sync";
import { isSupabaseMgmtConfigured } from "@/lib/supabase-mgmt";
import { isAuthorizedForDevOps } from "@/lib/dev-auth";

async function handle(req: NextRequest) {
  if (!(await isAuthorizedForDevOps(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseMgmtConfigured()) {
    return NextResponse.json({ error: "SUPABASE_ACCESS_TOKEN not configured" }, { status: 500 });
  }
  const result = await syncSupabaseProjects();
  const ok = result.errors.length === 0;
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 207 });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
