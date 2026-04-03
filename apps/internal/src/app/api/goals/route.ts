import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return user;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(goals).orderBy(goals.createdAt);
  return NextResponse.json({ goals: rows });
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, targetValue } = body;

  if (!name?.trim() || !targetValue) {
    return NextResponse.json({ error: "Name and target value are required" }, { status: 400 });
  }

  const [row] = await db
    .insert(goals)
    .values({
      name: name.trim(),
      description: description?.trim() || null,
      targetValue: String(targetValue),
      currentValue: "0",
      unit: "usd",
    })
    .returning();

  return NextResponse.json({ goal: row });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, description, targetValue, achieved } = body;

  if (!id) {
    return NextResponse.json({ error: "Goal id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (targetValue !== undefined) updates.targetValue = String(targetValue);
  if (achieved !== undefined) updates.achieved = achieved;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [row] = await db
    .update(goals)
    .set(updates)
    .where(eq(goals.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  return NextResponse.json({ goal: row });
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Goal id is required" }, { status: 400 });
  }

  await db.delete(goals).where(eq(goals.id, id));
  return NextResponse.json({ success: true });
}
