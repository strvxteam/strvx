import OutreachPage from "./outreach-client";
import { getProspects, getIndustries, getAllProspectTouchCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Leads — strvx" };

export default async function OutreachServerPage() {
  const [dbProspects, dbIndustries, touchCounts] = await Promise.all([
    getProspects(),
    getIndustries(),
    getAllProspectTouchCounts(),
  ]);

  const touchMap = new Map(
    touchCounts.map((tc) => [
      tc.prospectId,
      {
        count: tc.count,
        lastTouch: tc.lastTouch ? new Date(tc.lastTouch).toISOString() : null,
        lastChannel: tc.lastChannel,
      },
    ]),
  );

  const serializedProspects = dbProspects.map((p) => {
    const touch = touchMap.get(p.id);
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email ?? "",
      phone: p.phone ?? "",
      company: p.companyName,
      title: p.title ?? "",
      industrySlug: p.industrySlug ?? "",
      stage: p.stage as "cold" | "warm" | "hot" | "converted" | "lost",
      linkedinUrl: p.linkedinUrl ?? "",
      lastTouch: touch?.lastTouch ?? null,
      channel: (touch?.lastChannel as string) ?? "",
      touchCount: touch?.count ?? 0,
      notes: p.notes ?? "",
    };
  });

  const serializedIndustries = dbIndustries.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    icon: i.icon,
    color: i.color,
    sortOrder: i.sortOrder,
  }));

  return (
    <OutreachPage
      initialProspects={serializedProspects}
      initialIndustries={serializedIndustries}
    />
  );
}
