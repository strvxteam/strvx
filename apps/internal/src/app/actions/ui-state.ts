"use server";

// NOTE: Temporary stub. Real implementation depends on user_recents table
// (blocked on drizzle migration meta repair). When the real Task 4 ships,
// this file gets replaced with DB-backed actions.

export type UserRecent = {
  id: string;
  kind: "page" | "engagement" | "project" | "contact" | "invoice" | "task" | "doc";
  ref: string;
  label: string;
  lastVisitedAt: Date;
};

export async function recordVisit(_input: { kind: UserRecent["kind"]; ref: string; label: string }) {
  return { success: true as const };
}

export async function getRecents(): Promise<UserRecent[]> {
  return [];
}

export async function clearRecents() {
  return { success: true as const };
}
