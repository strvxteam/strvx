export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { portalTokens, companies, projects, tasks, taskAssignees, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

async function getPortalCompany() {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_token")?.value;
  if (!token) return null;

  const [portalToken] = await db
    .select({ companyId: portalTokens.companyId })
    .from(portalTokens)
    .where(eq(portalTokens.token, token));

  if (!portalToken) return null;

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, portalToken.companyId));

  return company;
}

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

  if (!project) redirect("/portal");

  // Get project tasks (no sensitive info)
  const projectTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(eq(tasks.projectId, id));

  const STATUS_COLORS: Record<string, string> = {
    todo: "bg-[#f0f0f0] text-[#666]",
    in_progress: "bg-[#e8f0fe] text-[#1a73e8]",
    done: "bg-[#e6f9e6] text-[#27ae60]",
    blocked: "bg-[#fde8e8] text-[#c0392b]",
  };

  return (
    <div>
      <Link href="/portal" className="mb-4 inline-block text-[13px] text-[#888] hover:text-[#555]">
        &larr; Back to portal
      </Link>

      <h1 className="mb-1 text-xl font-semibold text-[#111]">{project.name}</h1>
      <p className="mb-6 text-[13px] text-[#888]">
        Status: <span className="capitalize font-medium text-[#555]">{project.status.replace("_", " ")}</span>
        {project.startDate && <> &middot; Started {project.startDate}</>}
        {project.endDate && <> &middot; Due {project.endDate}</>}
      </p>

      {project.description && (
        <div className="mb-6 rounded-lg border border-[#e0e0e0] bg-white p-4">
          <h2 className="mb-2 text-[13px] font-semibold text-[#333]">Description</h2>
          <p className="text-[13px] leading-relaxed text-[#555]">{project.description}</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-[14px] font-semibold text-[#333]">Tasks ({projectTasks.length})</h2>
        {projectTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e0e0e0] bg-white py-6 text-center text-[13px] text-[#aaa]">
            No tasks yet
          </div>
        ) : (
          <div className="rounded-lg border border-[#e0e0e0] bg-white divide-y divide-[#f0f0f0]">
            {projectTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-[#222]">{task.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_COLORS[task.status] ?? STATUS_COLORS.todo}`}>
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
