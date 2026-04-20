import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.UI_STATE_CLEANUP_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Delete pins whose entity-typed ref points at a deleted/archived entity.
  // Page-typed rows are skipped (their ref is a route path, always valid).
  const deletedPins = await db.execute(sql`
    DELETE FROM user_pins
    WHERE (kind = 'engagement' AND ref NOT IN (SELECT id::text FROM engagements WHERE archived_at IS NULL))
       OR (kind = 'project' AND ref NOT IN (SELECT id::text FROM projects))
       OR (kind = 'contact' AND ref NOT IN (SELECT id::text FROM contacts WHERE archived_at IS NULL))
       OR (kind = 'task' AND ref NOT IN (SELECT id::text FROM tasks))
       OR (kind = 'invoice' AND ref NOT IN (SELECT id::text FROM invoices))
  `);

  return NextResponse.json({
    success: true,
    deletedPins: deletedPins.length ?? 0,
  });
}
