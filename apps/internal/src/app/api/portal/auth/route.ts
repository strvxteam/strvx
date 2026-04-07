import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { portalTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const [portalToken] = await db
    .select()
    .from(portalTokens)
    .where(eq(portalTokens.token, token));

  if (!portalToken) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Access code has expired" }, { status: 401 });
  }

  // Set cookie for portal auth
  const cookieStore = await cookies();
  cookieStore.set("portal_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/portal",
  });

  return NextResponse.json({ success: true });
}
