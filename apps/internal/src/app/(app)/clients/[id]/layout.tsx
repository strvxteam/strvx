import { notFound } from "next/navigation";
import { EntityShell } from "@/components/shell/entity-shell";
import { loadShellData } from "@/lib/shell-data";

export default async function EngagementLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const data = await loadShellData("engagement", id);
  if (!data) return notFound();

  const tabs = [
    { key: "overview", label: "Overview", href: `/clients/${id}` },
    { key: "activity", label: "Activity", href: `/clients/${id}/activity` },
    { key: "actions", label: "Next Actions", href: `/clients/${id}/actions` },
    { key: "tasks", label: "Tasks", href: `/clients/${id}/tasks` },
    { key: "files", label: "Files", href: `/clients/${id}/files` },
    { key: "invoices", label: "Invoices", href: `/clients/${id}/invoices` },
    { key: "notes", label: "Notes", href: `/clients/${id}/notes` },
  ];

  return (
    <EntityShell
      title={data.title}
      subtitle={data.subtitle}
      engagementId={id}
      tabs={tabs}
      rightRail={data.rightRail}
      kgEntityId={`postgres:engagements:${id}`}
    >
      {children}
    </EntityShell>
  );
}
