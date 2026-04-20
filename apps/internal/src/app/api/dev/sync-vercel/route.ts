export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { syncVercelProjects } from "@/lib/dev-sync";
import { isVercelConfigured } from "@/lib/vercel";

function authorized(req: NextRequest): boolean {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-refresh-secret");
  const expected = process.env.DEV_OPS_REFRESH_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return secret === expected;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isVercelConfigured()) {
    return NextResponse.json({ error: "VERCEL_TOKEN not configured" }, { status: 500 });
  }
  const result = await syncVercelProjects();
  const ok = result.errors.length === 0;
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 207 });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
