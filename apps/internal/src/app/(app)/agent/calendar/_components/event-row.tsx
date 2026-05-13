"use client";

import { useState } from "react";
import { BriefMarkdown } from "../../brief/_components/brief-markdown";

export type EventRowProps = {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  internalAttendees: string[];
  externalAttendees: string[];
  engagementName: string | null;
  prepBrief: {
    id: string;
    contentMarkdown: string;
    generatedAt: string;
  } | null;
  /** Minutes from `now` to event start. Negative = already started/past. */
  minutesUntilStart: number;
};

/**
 * One event row in the agent calendar list. Clicking opens a drawer with the
 * prep-brief markdown if a brief exists; otherwise the drawer shows a "no
 * brief yet" notice.
 */
export function EventRow(props: EventRowProps) {
  const [open, setOpen] = useState(false);
  const {
    title,
    startIso,
    internalAttendees,
    externalAttendees,
    engagementName,
    prepBrief,
    minutesUntilStart,
  } = props;

  const status = prepBriefStatus({ prepBrief, minutesUntilStart });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-[#f8f8f8]"
        style={{ borderBottom: "1px solid #f0f0f0" }}
      >
        <div style={{ width: 100, color: "#444", fontSize: 13, paddingTop: 2 }}>
          {formatTimePT(startIso)}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] font-medium"
            style={{ color: "#111" }}
          >
            {title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {externalAttendees.length > 0 && (
              <span style={{ color: "#333" }}>
                {externalAttendees.join(", ")}
              </span>
            )}
            {internalAttendees.length > 0 && (
              <span style={{ color: "#888" }}>
                {internalAttendees.join(", ")}
              </span>
            )}
          </div>
          {engagementName && (
            <div className="mt-1.5">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: "#eef2ff",
                  color: "#3730a3",
                  border: "1px solid #c7d2fe",
                }}
              >
                {engagementName}
              </span>
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-2 text-[12px]"
          style={{ color: status.color, whiteSpace: "nowrap", paddingTop: 2 }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: status.dot,
            }}
          />
          {status.label}
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)" }}
            aria-hidden="true"
          />
          <div
            className="absolute right-0 top-0 flex h-full flex-col overflow-y-auto bg-white shadow-xl"
            style={{ width: 560, maxWidth: "92vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-start justify-between px-6 py-5"
              style={{ borderBottom: "1px solid #e0e0e0" }}
            >
              <div className="min-w-0">
                <div className="text-[18px] font-semibold" style={{ color: "#111" }}>
                  {title}
                </div>
                <div className="mt-1 text-[12px]" style={{ color: "#666" }}>
                  {formatLongDateTime(startIso)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-4 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-[#f0f0f0]"
                style={{ color: "#444" }}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <div className="px-6 py-5">
              {prepBrief ? (
                <BriefMarkdown content={prepBrief.contentMarkdown} />
              ) : (
                <div
                  className="rounded-md px-4 py-5 text-[13px]"
                  style={{
                    background: "#fafafa",
                    border: "1px solid #e0e0e0",
                    color: "#555",
                  }}
                >
                  <p className="font-medium" style={{ color: "#222" }}>
                    No prep brief yet
                  </p>
                  <p className="mt-1" style={{ color: "#888" }}>
                    The 15-min prep cron generates briefs for upcoming meetings
                    with external attendees. If this event is more than an hour
                    out, the brief will appear closer to the start time.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function prepBriefStatus(args: {
  prepBrief: EventRowProps["prepBrief"];
  minutesUntilStart: number;
}): { label: string; color: string; dot: string } {
  if (args.prepBrief) {
    return { label: "Prep ready", color: "#15803d", dot: "#22c55e" };
  }
  if (args.minutesUntilStart >= 0 && args.minutesUntilStart <= 60) {
    return { label: "Generating…", color: "#b45309", dot: "#f59e0b" };
  }
  return { label: "—", color: "#888", dot: "#d4d4d8" };
}

function formatTimePT(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
}

function formatLongDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
}
