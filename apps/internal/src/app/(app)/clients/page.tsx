import type { Metadata } from "next";
import {
  getPipelineEngagements,
  getAllContactsByCompany,
  getAllEngagementTimelines,
  getAllEngagementActions,
  getAllFollowUpLinks,
  getUsers,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Clients" };
import { ClientsTable } from "./clients-table";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function ClientsPage() {
  const [engagementsList, contactsByCompany, timelines, actions, followUpLinksList, teamUsers] = await Promise.all([
    getPipelineEngagements(),
    getAllContactsByCompany(),
    getAllEngagementTimelines(),
    getAllEngagementActions(),
    getAllFollowUpLinks(),
    getUsers(),
  ]);

  // Group follow-up links by engagement ID. Internal-meeting links (no engagement)
  // are global and don't belong to any client row — skip them here.
  type EngagementLink = (typeof followUpLinksList)[number] & { engagementId: string };
  const followUpLinksByEngagement: Record<string, EngagementLink[]> = {};
  for (const link of followUpLinksList) {
    if (link.engagementId === null) continue;
    const engagementLink = link as EngagementLink;
    if (!followUpLinksByEngagement[engagementLink.engagementId]) {
      followUpLinksByEngagement[engagementLink.engagementId] = [];
    }
    followUpLinksByEngagement[engagementLink.engagementId].push(engagementLink);
  }

  return (
    <ClientsTable
      initialEngagements={engagementsList}
      initialContacts={contactsByCompany}
      initialTimeline={timelines}
      initialActions={actions}
      initialFollowUpLinks={followUpLinksByEngagement}
      teamMembers={teamUsers.map(u => ({ id: u.id, name: u.name }))}
    />
  );
}
