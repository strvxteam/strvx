export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import { getPortalCompany } from "../../portal-auth";
import { PortalNav } from "../../portal-nav";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-[#f0f0f0] text-[#666]",
  in_progress: "bg-[#e8f0fe] text-[#1a73e8]",
  done: "bg-[#e6f9e6] text-[#27ae60]",
  blocked: "bg-[#fde8e8] text-[#c0392b]",
};

export default async function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const company = await getPortalCompany();
  if (!company) redirect("/portal/login");

  const { id } = await params;
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.client, company.name)));

  if (!project) redirect("/portal/projects");

  const projectTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(eq(tasks.projectId, id));

  const doneCount = projectTasks.filter((t) => t.status === "done").length;
  const progress = projectTasks.length > 0 ? Math.round((doneCount / projectTasks.length) * 100) : 0;

  return (
    <div>
      <Link href="/portal/projects" className="mb-4 inline-block text-[13px] text-[#888] hover:text-[#555]">
        &larr; Back to projects
      </Link>

      <h1 className="mb-1 text-xl font-semibold text-[#111]">{project.name}</h1>
      <p className="mb-6 text-[13px] text-[#888]">
        Status: <span className="font-medium capitalize text-[#555]">{project.status.replace("_", " ")}</span>
        {project.startDate && <> &middot; Started {project.startDate}</>}
        {project.endDate && <> &middot; Due {project.endDate}</>}
      </p>

      <PortalNav />

      {project.description && (
        <div className="mb-6 rounded-xl border border-[#e0e0e0] bg-white p-5">
          <h2 className="mb-2 text-[13px] font-semibold text-[#333]">Description</h2>
          <p className="text-[13px] leading-relaxed text-[#555]">{project.description}</p>
        </div>
      )}

      {/* Progress */}
      {projectTasks.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#e0e0e0] bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#333]">Progress</h2>
            <span className="text-[14px] font-bold text-[#1a73e8]">{progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#f0f0f0]">
            <div className="h-full rounded-full bg-[#1a73e8] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-[#888]">{doneCount} of {projectTasks.length} tasks complete</p>
        </div>
      )}

      {/* Tasks */}
      <section>
        <h2 className="mb-3 text-[14px] font-semibold text-[#333]">Tasks ({projectTasks.length})</h2>
        {projectTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e0e0e0] bg-white py-12 text-center">
            <p className="text-[14px] text-[#aaa]">No tasks yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#e0e0e0] bg-white divide-y divide-[#f0f0f0]">
            {projectTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between px-5 py-4">
                <span className={`text-[14px] ${task.status === "done" ? "text-[#aaa] line-through" : "text-[#222]"}`}>{task.title}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_COLORS[task.status] ?? STATUS_COLORS.todo}`}>
                  {task.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
