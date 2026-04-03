export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { users } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUrl } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const secret = searchParams.get("secret");

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberId = searchParams.get("memberId");

  if (memberId) {
    const url = getAuthUrl(memberId);
    return NextResponse.redirect(url);
  }

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      googleRefreshToken: users.googleRefreshToken,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.name);

  const result = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    connected: !!m.googleRefreshToken,
    connectUrl: m.googleRefreshToken
      ? null
      : `/api/auth/google/connect?secret=${secret}&memberId=${m.id}`,
  }));

  return NextResponse.json({ members: result });
}
