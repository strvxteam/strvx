export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEngagement, getEngagementTimeline } from "@/lib/queries";
import { analyzeSentiment } from "@/lib/ai-sentiment";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 400 });
  }

  const { engagementId } = await req.json();
  if (!engagementId) {
    return NextResponse.json({ error: "engagementId required" }, { status: 400 });
  }

  const engagement = await getEngagement(engagementId);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  const timeline = await getEngagementTimeline(engagementId);

  const result = await analyzeSentiment({
    companyName: engagement.companyName,
    engagementName: engagement.name,
    interactions: timeline.map((i) => ({
      type: i.type,
      content: i.content,
      date: new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      author: i.authorName,
    })),
  });

  return NextResponse.json(result);
}
