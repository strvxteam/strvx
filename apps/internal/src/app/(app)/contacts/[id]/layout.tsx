import { notFound } from "next/navigation";
import { EntityShell } from "@/components/shell/entity-shell";
import { loadShellData } from "@/lib/shell-data";

// TODO: engagementId is passed through but this is a contact shell.
// Follow-up: make EntityHeader kind-aware so CTAs route against the right entity.
export default async function ContactLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const data = await loadShellData("contact", id);
  if (!data) return notFound();

  const tabs = [
    { key: "overview", label: "Overview", href: `/contacts/${id}` },
    { key: "activity", label: "Activity", href: `/contacts/${id}/activity` },
    { key: "engagements", label: "Engagements", href: `/contacts/${id}/engagements` },
    { key: "tasks", label: "Tasks", href: `/contacts/${id}/tasks` },
    { key: "files", label: "Files", href: `/contacts/${id}/files` },
  ];

  return (
    <EntityShell
      title={data.title}
      subtitle={data.subtitle}
      engagementId={id}
      tabs={tabs}
      rightRail={data.rightRail}
      kgEntityId={`postgres:contacts:${id}`}
    >
      {children}
    </EntityShell>
  );
}
