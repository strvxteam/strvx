import { notFound } from "next/navigation";
import { EntityShell } from "@/components/shell/entity-shell";
import { loadShellData } from "@/lib/shell-data";

// TODO: EntityHeader currently routes all CTAs through engagement-scoped actions.
// For project shell, this means "Add task" posts the project id as engagementId.
// Follow-up: extend EntityHeader with a kind-aware CTA config. For now, users
// who want to add tasks to projects should use the Tasks tab directly.
export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const data = await loadShellData("project", id);
  if (!data) return notFound();

  const tabs = [
    { key: "overview", label: "Overview", href: `/projects/${id}` },
    { key: "activity", label: "Activity", href: `/projects/${id}/activity` },
    { key: "tasks", label: "Tasks", href: `/projects/${id}/tasks` },
    { key: "files", label: "Files", href: `/projects/${id}/files` },
    { key: "invoices", label: "Invoices", href: `/projects/${id}/invoices` },
  ];

  return (
    <EntityShell
      pathname={`/projects/${id}`}
      title={data.title}
      subtitle={data.subtitle}
      engagementId={id}
      tabs={tabs}
      rightRail={data.rightRail}
    >
      {children}
    </EntityShell>
  );
}
