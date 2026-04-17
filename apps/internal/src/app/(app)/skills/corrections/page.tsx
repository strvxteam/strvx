import type { Metadata } from "next";
import { getCorrections } from "@/lib/queries";
import { CorrectionsManager } from "./corrections-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills — Corrections" };

export default async function CorrectionsPage() {
  const allCorrections = await getCorrections();
  return <CorrectionsManager initialCorrections={allCorrections} />;
}
