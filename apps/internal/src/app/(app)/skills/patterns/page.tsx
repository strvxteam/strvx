import type { Metadata } from "next";
import { getPatterns } from "@/lib/queries";
import { PatternsLibrary } from "./patterns-library";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills — Patterns" };

export default async function PatternsPage() {
  const allPatterns = await getPatterns();
  return <PatternsLibrary initialPatterns={allPatterns} />;
}
