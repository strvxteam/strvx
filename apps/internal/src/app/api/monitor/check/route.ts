export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitoredSites, uptimeChecks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  // Protect with secret for cron, or allow authenticated internal calls
  const secret = req.nextUrl.searchParams.get("secret");
  const isAuthed = secret === process.env.MONITOR_SECRET;

  // Also allow from internal app with cookie auth
  if (!isAuthed && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await db
    .select()
    .from(monitoredSites)
    .where(eq(monitoredSites.isActive, true));

  const results = await Promise.all(
    sites.map(async (site) => {
      const start = Date.now();
      let status: "up" | "down" = "down";
      let statusCode: number | null = null;
      let responseMs: number | null = null;
      let errorMessage: string | null = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(site.url, {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal,
        });

        clearTimeout(timeout);
        responseMs = Date.now() - start;
        statusCode = res.status;
        status = res.status < 500 ? "up" : "down";
      } catch (err) {
        responseMs = Date.now() - start;
        errorMessage = err instanceof Error ? err.message : "Unknown error";
        status = "down";
      }

      // Store check result
      await db.insert(uptimeChecks).values({
        siteId: site.id,
        status,
        statusCode,
        responseMs,
        errorMessage,
      });

      return {
        siteId: site.id,
        name: site.name,
        url: site.url,
        status,
        statusCode,
        responseMs,
        errorMessage,
      };
    })
  );

  return NextResponse.json({ checked: results.length, results });
}
