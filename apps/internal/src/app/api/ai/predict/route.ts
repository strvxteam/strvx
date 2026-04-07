export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEngagement } from "@/lib/queries";
import { predictPipelineOutcome } from "@/lib/ai-predictions";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { engagementId } = await req.json();
  if (!engagementId || typeof engagementId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(engagementId)) {
    return NextResponse.json({ error: "Valid engagementId required" }, { status: 400 });
  }

  const engagement = await getEngagement(engagementId);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  const prediction = await predictPipelineOutcome(engagementId, engagement.stage);
  return NextResponse.json(prediction);
}
