import { notFound } from "next/navigation";
import { getEngagement } from "@/lib/queries";
import { EngagementOverview } from "@/components/client/engagement-overview";

export const dynamic = "force-dynamic";

export default async function EngagementOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const engagement = await getEngagement(id);
  if (!engagement) return notFound();
  return <EngagementOverview engagement={engagement} />;
}
