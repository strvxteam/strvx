import type { Metadata } from "next";
import {
  getPipelineEngagements,
  getAllContactsByCompany,
  getAllEngagementTimelines,
  getAllEngagementActions,
  getUsers,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Clients" };
import { ClientsTable } from "./clients-table";

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const [engagementsList, contactsByCompany, timelines, actions, teamUsers] = await Promise.all([
    getPipelineEngagements(),
    getAllContactsByCompany(),
    getAllEngagementTimelines(),
    getAllEngagementActions(),
    getUsers(),
  ]);

  return (
    <ClientsTable
      initialEngagements={engagementsList}
      initialContacts={contactsByCompany}
      initialTimeline={timelines}
      initialActions={actions}
      teamMembers={teamUsers.map(u => ({ id: u.id, name: u.name }))}
    />
  );
}
