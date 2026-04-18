"use server";

import { db } from "@/lib/db";
import { userPins, userRecents } from "@strvx/db/schema";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "../actions";

const KINDS = ["page", "engagement", "project", "contact", "invoice", "task", "doc"] as const;
export type UserRecentKind = (typeof KINDS)[number];

export type UserRecent = {
  id: string;
  kind: UserRecentKind;
  ref: string;
  label: string;
  lastVisitedAt: Date;
};

const recordVisitSchema = z.object({
  kind: z.enum(KINDS),
  ref: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
});

const MAX_RECENTS = 10;

export async function recordVisit(input: { kind: UserRecentKind; ref: string; label: string }) {
  const parsed = recordVisitSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const user = await getCurrentUser();

  await db
    .insert(userRecents)
    .values({ userId: user.id, ...parsed.data })
    .onConflictDoUpdate({
      target: [userRecents.userId, userRecents.kind, userRecents.ref],
      set: { lastVisitedAt: sql`now()`, label: parsed.data.label },
    });

  const keep = await db
    .select({ id: userRecents.id })
    .from(userRecents)
    .where(eq(userRecents.userId, user.id))
    .orderBy(desc(userRecents.lastVisitedAt))
    .limit(MAX_RECENTS);

  if (keep.length === MAX_RECENTS) {
    await db
      .delete(userRecents)
      .where(and(eq(userRecents.userId, user.id), notInArray(userRecents.id, keep.map((r) => r.id))));
  }

  return { success: true as const };
}

export async function getRecents(): Promise<UserRecent[]> {
  const user = await getCurrentUser();
  const rows = await db
    .select()
    .from(userRecents)
    .where(eq(userRecents.userId, user.id))
    .orderBy(desc(userRecents.lastVisitedAt))
    .limit(MAX_RECENTS);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as UserRecentKind,
    ref: r.ref,
    label: r.label,
    lastVisitedAt: r.lastVisitedAt,
  }));
}

export async function clearRecents() {
  const user = await getCurrentUser();
  await db.delete(userRecents).where(eq(userRecents.userId, user.id));
  return { success: true as const };
}

// ── Pins ─────────────────────────────────────────────────

const MAX_PINS = 8;

const pinItemSchema = z.object({
  kind: z.enum(KINDS),
  ref: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  iconKey: z.string().max(60).optional(),
});

export type UserPin = {
  id: string;
  kind: UserRecentKind;
  ref: string;
  label: string;
  iconKey: string;
  position: number;
};

export async function pinItem(input: z.infer<typeof pinItemSchema>) {
  const parsed = pinItemSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const user = await getCurrentUser();

  const existing = await db.select({ id: userPins.id }).from(userPins).where(eq(userPins.userId, user.id));
  if (existing.length >= MAX_PINS) {
    return { success: false as const, error: `Max ${MAX_PINS} pins. Unpin something first.` };
  }

  const nextPos = existing.length;
  try {
    await db.insert(userPins).values({
      userId: user.id,
      kind: parsed.data.kind,
      ref: parsed.data.ref,
      label: parsed.data.label,
      iconKey: parsed.data.iconKey ?? "",
      position: nextPos,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("user_pins_user_kind_ref")) {
      return { success: false as const, error: "Already pinned" };
    }
    throw err;
  }
  return { success: true as const };
}

export async function unpinItem(input: { kind: UserRecentKind; ref: string }) {
  const user = await getCurrentUser();
  await db.delete(userPins).where(and(
    eq(userPins.userId, user.id),
    eq(userPins.kind, input.kind),
    eq(userPins.ref, input.ref),
  ));
  return { success: true as const };
}

export async function reorderPins(orderedIds: string[]) {
  const user = await getCurrentUser();
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(userPins).set({ position: i }).where(and(eq(userPins.userId, user.id), eq(userPins.id, orderedIds[i])));
    }
  });
  return { success: true as const };
}

export async function getPins(): Promise<UserPin[]> {
  const user = await getCurrentUser();
  const rows = await db.select().from(userPins).where(eq(userPins.userId, user.id)).orderBy(userPins.position);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as UserRecentKind,
    ref: r.ref,
    label: r.label,
    iconKey: r.iconKey,
    position: r.position,
  }));
}
