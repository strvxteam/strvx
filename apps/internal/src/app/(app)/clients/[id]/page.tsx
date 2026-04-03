import { notFound } from "next/navigation";
import {
  getEngagement,
  getEngagementTimeline,
  getEngagementActions,
  getPipelineEngagements,
  getContactsByCompany,
  getUsers,
} from "@/lib/queries";
import { ClientDetailView } from "@/components/client/client-detail-view";
import { QuickAddBar } from "@/components/quick-add-bar";

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  type TimelineEntry = { id: string; type: string; content: string; scheduledAt: Date | null; createdAt: Date; authorName: string };
  type ActionEntry = { id: string; description: string; dueDate: string | null; completed: boolean; completedAt: Date | null; ownerName: string; ownerId: string };

  const engagement = await getEngagement(id);

  if (!engagement) return notFound();

  const [timeline, actions, engData, companyContacts, teamUsers] = await Promise.all([
    getEngagementTimeline(id) as Promise<TimelineEntry[]>,
    getEngagementActions(id) as Promise<ActionEntry[]>,
    getPipelineEngagements(),
    getContactsByCompany(engagement.companyId),
    getUsers(),
  ]);

  const allEngagements = engData.map((e) => ({
    id: e.id,
    name: e.name,
    companyName: e.companyName,
  }));

  // Derive nextActionDueDate from the earliest uncompleted action
  const nextActionDueDate = actions
    .filter((a) => !a.completed && a.dueDate)
    .map((a) => a.dueDate!)
    .sort()[0] ?? null;

  const engagementWithNextAction = {
    ...engagement,
    tags: engagement.tags ?? [],
    contactId: engagement.contactId ?? "",
    contactName: engagement.contactName ?? "",
    contactEmail: engagement.contactEmail ?? "",
    companyIndustry: engagement.companyIndustry ?? "",
    nextActionDueDate,
  };

  return (
    <>
      <ClientDetailView
        initialEngagement={engagementWithNextAction}
        initialTimeline={timeline}
        initialActions={actions}
        initialContacts={companyContacts}
        allEngagements={allEngagements}
        teamMembers={teamUsers.map(u => ({ id: u.id, name: u.name }))}
      />
      <QuickAddBar
        engagements={allEngagements}
        defaultEngagementId={engagement.id}
      />
    </>
  );
}
