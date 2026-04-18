import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPartner,
  getPartnerContacts,
  getPartnerLinkedEngagements,
  getPartnerLinkedProjects,
  getPartnerTimeline,
} from "@/lib/partner-queries";
import { getPipelineEngagements } from "@/lib/queries";
import { PartnerDetailView } from "@/components/partner/partner-detail-view";

export const metadata: Metadata = { title: "Partner Detail" };
export const dynamic = "force-dynamic";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [partner, contacts, linkedEngagements, linkedProjects, timeline, allEngagements] =
    await Promise.all([
      getPartner(id),
      getPartnerContacts(id),
      getPartnerLinkedEngagements(id),
      getPartnerLinkedProjects(id),
      getPartnerTimeline(id),
      getPipelineEngagements(),
    ]);

  if (!partner) notFound();

  return (
    <PartnerDetailView
      partner={partner}
      contacts={contacts}
      linkedEngagements={linkedEngagements}
      linkedProjects={linkedProjects}
      timeline={timeline}
      allEngagements={allEngagements}
    />
  );
}
