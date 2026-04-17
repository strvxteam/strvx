import type { Metadata } from "next";
import { getSkillLibrariesWithComponentCount } from "@/lib/queries";
import { LibraryGrid } from "./library-grid";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills — Libraries" };

export default async function SkillLibrariesPage() {
  const libraries = await getSkillLibrariesWithComponentCount();
  return <LibraryGrid initialLibraries={libraries} />;
}
