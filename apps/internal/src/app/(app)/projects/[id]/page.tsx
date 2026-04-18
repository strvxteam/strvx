import { notFound } from "next/navigation";
import { getProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Project Overview" };

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return notFound();
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Name" value={project.name} />
      <Field label="Client" value={project.client ?? "—"} />
      <Field label="Status" value={project.status ?? "—"} />
      <Field label="Engagement" value={project.engagementId ?? "—"} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[#888]">{label}</div>
      <div className="text-[13px] text-[#222]">{value}</div>
    </div>
  );
}
