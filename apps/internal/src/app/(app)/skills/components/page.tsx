import type { Metadata } from "next";
import { getSkillComponents, getSkillLibraries } from "@/lib/queries";
import { ComponentsCatalog } from "./components-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills — Components" };

export default async function SkillComponentsPage({
  searchParams,
}: {
  searchParams: Promise<{ library?: string; category?: string; status?: string; search?: string }>;
}) {
  const params = await searchParams;
  const [components, libraries] = await Promise.all([
    getSkillComponents({
      libraryId: params.library,
      category: params.category,
      status: params.status,
      search: params.search,
    }),
    getSkillLibraries(),
  ]);
  return (
    <ComponentsCatalog
      initialComponents={components}
      libraries={libraries}
      initialFilters={{
        library: params.library ?? "",
        category: params.category ?? "",
        status: params.status ?? "",
        search: params.search ?? "",
      }}
    />
  );
}
