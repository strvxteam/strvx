import Link from "next/link";
import { loadAgentCalendar, groupEventsByPtDay } from "./_queries";
import { EventRow } from "./_components/event-row";

export const dynamic = "force-dynamic";

/**
 * /agent/calendar — today + next 7 days of meetings across all active
 * mailboxes, with engagement chips and a prep-brief indicator per event.
 * Admin gate is inherited from src/app/(app)/agent/layout.tsx.
 */
export default async function AgentCalendarPage() {
  const now = new Date();
  const data = await loadAgentCalendar(now);

  if (data.mailboxCount === 0) {
    return (
      <main className="px-8 py-10">
        <h1 className="text-[20px] font-semibold" style={{ color: "#111" }}>
          Calendar
        </h1>
        <div
          className="mt-6 rounded-md px-6 py-12 text-center text-[13px]"
          style={{ borderColor: "#e0e0e0", border: "1px solid #e0e0e0", background: "#fafafa", color: "#666" }}
        >
          <p className="font-medium" style={{ color: "#222" }}>
            No mailboxes connected
          </p>
          <p className="mt-1" style={{ color: "#888" }}>
            Connect a Gmail mailbox to start seeing the agent calendar view.
          </p>
          <Link
            href="/agent/connect-mailbox"
            className="mt-4 inline-block rounded-md px-4 py-2 text-[13px]"
            style={{ background: "#111", color: "#fff" }}
          >
            Connect mailbox
          </Link>
        </div>
      </main>
    );
  }

  const groups = groupEventsByPtDay(data.events);

  return (
    <main className="px-8 py-10" style={{ maxWidth: 960, marginInline: "auto" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "#111" }}>
            Calendar
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#888" }}>
            Today + next 7 days across {data.mailboxCount}{" "}
            {data.mailboxCount === 1 ? "mailbox" : "mailboxes"}
          </p>
        </div>
      </div>

      {data.issues.map((issue) => (
        <div
          key={issue.mailboxId}
          className="mb-4 rounded-md px-4 py-3 text-[13px]"
          style={{
            background: "#fef3c7",
            border: "1px solid #fde68a",
            color: "#78350f",
          }}
        >
          {issue.kind === "scope_missing" ? (
            <>
              Calendar access not granted for{" "}
              <span style={{ fontWeight: 600 }}>{issue.email}</span>.{" "}
              <Link
                href="/agent/connect-mailbox"
                className="underline"
                style={{ color: "#78350f" }}
              >
                Reconnect via /agent/connect-mailbox
              </Link>
              .
            </>
          ) : (
            <>
              Failed to load calendar for{" "}
              <span style={{ fontWeight: 600 }}>{issue.email}</span>
              {issue.message ? `: ${issue.message}` : "."}
            </>
          )}
        </div>
      ))}

      {groups.length === 0 ? (
        <div
          className="rounded-md px-6 py-12 text-center text-[13px]"
          style={{
            border: "1px solid #e0e0e0",
            background: "#fafafa",
            color: "#666",
          }}
        >
          No meetings on the calendar in the next 7 days.
        </div>
      ) : (
        <div
          className="rounded-md"
          style={{ border: "1px solid #e0e0e0", background: "#fff" }}
        >
          {groups.map((group, gi) => (
            <section key={group.date}>
              <div
                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  background: "#fafafa",
                  color: "#666",
                  borderTop: gi === 0 ? undefined : "1px solid #e0e0e0",
                  borderBottom: "1px solid #e0e0e0",
                }}
              >
                {group.label}
              </div>
              {group.events.map((e) => {
                const minutesUntilStart = Math.round(
                  (Date.parse(e.start) - now.getTime()) / 60000
                );
                return (
                  <EventRow
                    key={`${e.mailboxId}:${e.id}`}
                    id={e.id}
                    title={e.title}
                    startIso={e.start}
                    endIso={e.end}
                    internalAttendees={e.internalAttendees}
                    externalAttendees={e.externalAttendees}
                    engagementName={e.engagementName}
                    prepBrief={e.prepBrief}
                    minutesUntilStart={minutesUntilStart}
                  />
                );
              })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
