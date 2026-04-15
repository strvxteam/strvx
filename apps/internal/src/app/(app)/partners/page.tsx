import type { Metadata } from "next";
import { getAllPartners } from "@/lib/partner-queries";
import { PartnersTable } from "./partners-table";

export const metadata: Metadata = { title: "Partners" };
export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const partners = await getAllPartners();
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Partner Directory</h1>
      </div>
      <PartnersTable initialPartners={partners} />
    </div>
  );
}
