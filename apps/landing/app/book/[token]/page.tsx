import { notFound } from "next/navigation";
import { db } from "@strvx/db";
import { followUpLinks, engagements, companies, contacts, bookings } from "@strvx/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import FollowUpBookingWidget from "./booking-widget";

export const dynamic = "force-dynamic";

// Link expires if no booking was made with it in the last 3 months
// AND it was created more than 3 months ago.
function isExpired(createdAt: Date, lastBookingAt: Date | null): boolean {
  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THREE_MONTHS_MS;
  const lastActivity = lastBookingAt ?? createdAt;
  return lastActivity.getTime() < cutoff;
}

export default async function FollowUpBookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Load the follow-up link
  const [link] = await db
    .select()
    .from(followUpLinks)
    .where(eq(followUpLinks.token, token))
    .limit(1);

  if (!link) return notFound();

  // Check last booking made via this link
  const [lastBooking] = await db
    .select({ createdAt: bookings.createdAt })
    .from(bookings)
    .where(eq(bookings.followUpToken, token))
    .orderBy(desc(bookings.createdAt))
    .limit(1);

  if (isExpired(link.createdAt, lastBooking?.createdAt ?? null)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#555] mb-3">strvx</p>
          <h1 className="text-2xl font-bold mb-2">Link expired</h1>
          <p className="text-[#666]">This booking link is no longer active. Please reach out to your contact at strvx.</p>
        </div>
      </div>
    );
  }

  // Load engagement + primary contact for pre-fill
  const [row] = await db
    .select({
      engagementId: engagements.id,
      engagementName: engagements.name,
      companyName: companies.name,
      contactName: contacts.name,
      contactEmail: contacts.email,
    })
    .from(engagements)
    .innerJoin(companies, eq(engagements.companyId, companies.id))
    .leftJoin(contacts, eq(engagements.primaryContactId, contacts.id))
    .where(eq(engagements.id, link.engagementId))
    .limit(1);

  const typeLabel = link.meetingType === "proposal" ? "Proposal Call" : "Revision Call";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex flex-col">
      <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-24 pb-6 w-full">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#555] mb-3">strvx</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Schedule your {typeLabel}.
        </h1>
        {row?.contactName && (
          <p className="text-[#666] text-base">
            Hey {row.contactName.split(" ")[0]}, pick a time that works for you.
          </p>
        )}
      </div>

      <div className="flex-1 max-w-3xl mx-auto px-6 pb-16 w-full">
        <FollowUpBookingWidget
          token={token}
          meetingType={link.meetingType}
          prefill={{
            name: row?.contactName ?? "",
            email: row?.contactEmail ?? "",
            company: row?.companyName ?? "",
          }}
        />
      </div>
    </div>
  );
}
