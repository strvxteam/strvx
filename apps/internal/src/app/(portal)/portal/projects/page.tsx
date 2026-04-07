export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPortalCompany } from "../portal-auth";
import { PortalNav } from "../portal-nav";

const STATUS_COLORS: Record<string, string> = {
  scoping: "bg-[#f0f0f0] text-[#666]",
  in_progress: "bg-[#e8f0fe] text-[#1a73e8]",
  active: "bg-[#e8f0fe] text-[#1a73e8]",
  completed: "bg-[#e6f9e6] text-[#27ae60]",
  on_hold: "bg-[#fff3e0] text-[#e65100]",
};

export default async function PortalProjectsPage() {
  const company = await getPortalCompany();
  if (!company) redirect("/portal/login");

  const companyProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      description: projects.description,
      taskCount: sql<number>`(SELECT count(*)::int FROM tasks WHERE tasks.project_id = ${projects.id})`,
      doneCount: sql<number>`(SELECT count(*)::int FROM tasks WHERE tasks.project_id = ${projects.id} AND tasks.status = 'done')`,
    })
    .from(projects)
    .where(eq(projects.client, company.name));

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-[#111]">Projects</h1>
      <p className="mb-6 text-[13px] text-[#888]">{companyProjects.length} project{companyProjects.length !== 1 ? "s" : ""} for {company.name}</p>

      <PortalNav />

      {companyProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e0e0e0] bg-white py-16 text-center">
          <p className="text-[15px] font-medium text-[#aaa]">No projects yet</p>
          <p className="mt-1 text-[13px] text-[#ccc]">Projects will appear here once work begins.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {companyProjects.map((p) => {
            const progress = p.taskCount > 0 ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
            return (
              <Link key={p.id} href={`/portal/projects/${p.id}`}
                className="group rounded-xl border border-[#e0e0e0] bg-white p-5 transition-colors hover:border-[#ccc]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[#222]">{p.name}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_COLORS[p.status] ?? STATUS_COLORS.scoping}`}>
                    {p.status.replace("_", " ")}
                  </span>
                </div>
                {p.description && (
                  <p className="mb-3 line-clamp-2 text-[13px] text-[#888]">{p.description}</p>
                )}
                <div className="flex items-center gap-4 text-[12px] text-[#888]">
                  {p.startDate && <span>Started {p.startDate}</span>}
                  {p.endDate && <span>Due {p.endDate}</span>}
                </div>
                {p.taskCount > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-[#888]">{p.doneCount}/{p.taskCount} tasks</span>
                      <span className="font-medium text-[#555]">{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                      <div className="h-full rounded-full bg-[#1a73e8] transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
