import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Allow a request through if either:
//  1) the caller has a valid Supabase session (UI button click), OR
//  2) the caller presents DEV_OPS_REFRESH_SECRET (cron / curl).
// In development, when no secret is configured, the route is open.
export async function isAuthorizedForDevOps(req: NextRequest): Promise<boolean> {
  const provided =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-refresh-secret");
  const expected = process.env.DEV_OPS_REFRESH_SECRET;

  if (provided && expected && provided === expected) return true;

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user?.email) return true;
  } catch {
    /* fall through */
  }

  if (!expected && process.env.NODE_ENV !== "production") return true;
  return false;
}
