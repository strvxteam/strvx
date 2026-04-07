export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEngagement, getEngagementTimeline, getUserByEmail } from "@/lib/queries";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateProposal } from "@/lib/ai-proposals";

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
  if (!engagementId || typeof engagementId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(engagementId)) {
    return NextResponse.json({ error: "Valid engagementId required" }, { status: 400 });
  }

  const engagement = await getEngagement(engagementId);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  const timeline = await getEngagementTimeline(engagementId);
  const engProjects = await db
    .select({ name: projects.name, status: projects.status })
    .from(projects)
    .where(eq(projects.engagementId, engagementId));

  const proposal = await generateProposal({
    companyName: engagement.companyName,
    companyIndustry: engagement.companyIndustry,
    engagementName: engagement.name,
    stage: engagement.stage,
    dealValue: engagement.dealValue ? Number(engagement.dealValue) : null,
    contactName: engagement.contactName,
    contactEmail: engagement.contactEmail,
    recentInteractions: timeline.map((i) => ({
      type: i.type,
      content: i.content,
      date: new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })),
    existingProjects: engProjects,
  });

  return NextResponse.json({ proposal });
}
