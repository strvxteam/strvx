import ProjectsPage from "./projects-client";
import { getProjects, getCompanies } from "@/lib/queries";
import { type Project } from "@/lib/mock-projects";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Projects" };

export default async function ProjectsServerPage() {
  const [dbProjects, companies] = await Promise.all([
    getProjects(),
    getCompanies(),
  ]);

  const initialProjects: Project[] = dbProjects.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client ?? "",
    status: (p.status ?? "scoping") as Project["status"],
    team: (p.team as string[]) ?? [],
    startDate: p.startDate ?? new Date().toISOString().split("T")[0],
    endDate: p.endDate ?? null,
    updatedAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    description: p.description ?? "",
    timeEntries: [],
    timeline: [],
  }));

  const companyNames = companies.map((c) => c.name);

  return <ProjectsPage initialProjects={initialProjects} companyNames={companyNames} />;
}
