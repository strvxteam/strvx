import { notFound } from "next/navigation";
import { db } from "@strvx/db";
import { followUpLinks, engagements, companies, contacts, bookings } from "@strvx/db/schema";
import { eq, desc } from "drizzle-orm";
import FollowUpBookingWidget from "./booking-widget";
import { getMeetingLabel, isDurationPickerMeeting } from "@/lib/meeting-types";

export const dynamic = "force-dynamic";

// Link expires if no booking was made with it in the last 3 months
// AND it was created more than 3 months ago.
function isExpired(createdAt: Date, lastBookingAt: Date | null): boolean {
  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THREE_MONTHS_MS;
  const lastActivity = lastBookingAt ?? createdAt;
  return lastActivity.getTime() < cutoff;
}

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "mx", "dr", "prof", "professor", "rev", "sir", "dame", "lord", "lady",
]);

function isHonorific(token: string): boolean {
  return HONORIFICS.has(token.replace(/\.$/, "").toLowerCase());
}

function withPeriod(honorific: string): string {
  return honorific.endsWith(".") ? honorific : `${honorific}.`;
}

function greetingName(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length >= 2 && isHonorific(tokens[0])) {
    return `${withPeriod(tokens[0])} ${tokens[tokens.length - 1]}`;
  }
  for (const t of tokens) {
    if (!isHonorific(t)) return t;
  }
  return tokens[0] ?? fullName;
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

  // Internal AND partner meetings share the same UX: no engagement context,
  // booker picks duration. Engagement-bound types (proposal/revision/in_person)
  // get the named-contact prefill flow.
  const teamMeeting = isDurationPickerMeeting(link.meetingType);
  const typeLabel = getMeetingLabel(link.meetingType);

  // Load engagement + primary contact for pre-fill (only for engagement-bound links)
  const row = !teamMeeting && link.engagementId
    ? (
        await db
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
          .limit(1)
      )[0]
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex flex-col">
      <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-24 pb-6 w-full">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#555] mb-3">strvx</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          {teamMeeting
            ? "Schedule a meeting with the strvx team."
            : `Schedule your ${typeLabel}.`}
        </h1>
        {!teamMeeting && row?.contactName ? (
          <p className="text-[#666] text-base">
            Hey {greetingName(row.contactName)}, pick a time that works for you.
          </p>
        ) : teamMeeting ? (
          <p className="text-[#666] text-base">
            Pick a duration and time that works for you.
          </p>
        ) : null}
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
