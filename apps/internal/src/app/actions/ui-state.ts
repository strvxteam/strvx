"use server";

import { db } from "@/lib/db";
import { userRecents } from "@strvx/db/schema";
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
