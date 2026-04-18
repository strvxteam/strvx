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

  // Group follow-up links by engagement ID
  const followUpLinksByEngagement: Record<string, typeof followUpLinksList> = {};
  for (const link of followUpLinksList) {
    if (!followUpLinksByEngagement[link.engagementId]) {
      followUpLinksByEngagement[link.engagementId] = [];
    }
    followUpLinksByEngagement[link.engagementId].push(link);
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
