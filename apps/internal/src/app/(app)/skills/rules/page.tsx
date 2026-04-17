import type { Metadata } from "next";
import { getSkills } from "@/lib/queries";
import { RulesManager } from "./rules-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills — Rules" };

export default async function SkillRulesPage() {
  const allSkills = await getSkills();
  const presets = allSkills.filter((s) => s.type === "preset");
  const custom = allSkills.filter((s) => s.type === "custom");
  return <RulesManager initialPresets={presets} initialCustom={custom} />;
}
