import { NextResponse } from "next/server";
import { listBrainLabelCounts, listRecentBrainNodes } from "@/lib/kg/brain-reader";
import { isGbrainConfigured } from "@/lib/kg/gbrain-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kg/health — observability snapshot of the brain:
 *   - filesystem reachable + page counts per label
 *   - gbrain MCP configured + reachable
 *   - newest source_updated_at (proxy for "how stale is the brain?")
 */
export async function GET(): Promise<NextResponse> {
  const t0 = Date.now();
  let labels: Array<{ label: string; count: number }> = [];
  let fsError: string | null = null;
  try {
    labels = await listBrainLabelCounts();
  } catch (e) {
    fsError = (e as Error).message;
  }

  let mostRecent: string | null = null;
  try {
    const recent = await listRecentBrainNodes(365, 1);
    if (recent.length > 0) {
      const fm = recent[0].properties as Record<string, unknown>;
      mostRecent =
        (typeof fm.source_updated_at === "string"
          ? fm.source_updated_at
          : null) ??
        recent[0].provenance.last_validated_at ??
        null;
    }
  } catch {
    // best-effort
  }

  const gbrain: {
    configured: boolean;
    url: string | null;
    reachable: boolean | null;
    error: string | null;
  } = {
    configured: isGbrainConfigured(),
    url: process.env.GBRAIN_MCP_URL ?? null,
    reachable: null,
    error: null,
  };

  if (gbrain.configured && gbrain.url) {
    try {
      const probe = await fetch(gbrain.url.replace(/\/mcp$/, "/health"), {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      gbrain.reachable = probe.ok;
    } catch (e) {
      gbrain.reachable = false;
      gbrain.error = (e as Error).message;
    }
  }

  const totalPages = labels.reduce((s, l) => s + l.count, 0);
  return NextResponse.json({
    ok: fsError === null,
    elapsed_ms: Date.now() - t0,
    brain: {
      total_pages: totalPages,
      label_counts: labels,
      most_recent_source_update: mostRecent,
      error: fsError,
    },
    gbrain_mcp: gbrain,
  });
}
