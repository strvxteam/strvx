"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { approveScheduleAndSend, rejectScheduleSlots } from "../_actions";
import { useRowPulse } from "@/lib/use-row-pulse";

export type SchedulingProposalCardProps = {
  proposal: {
    id: string;
    kind: "new_meeting" | "reschedule" | "cancel";
    meetingTitle: string;
    meetingDescription: string | null;
    durationMinutes: number;
    proposedSlots: Array<{ start: string; end: string }>;
    attendees: string[];
    location: string;
    linkedDraftId: string | null;
  };
};

const PT_TZ = "America/Los_Angeles";

function formatSlot(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const dayPart = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: PT_TZ,
  });
  const startPart = s.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PT_TZ,
  });
  const endPart = e.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PT_TZ,
    timeZoneName: "short",
  });
  return `${dayPart} · ${startPart}–${endPart}`;
}

const KIND_LABEL: Record<
  SchedulingProposalCardProps["proposal"]["kind"],
  { text: string; bg: string; fg: string }
> = {
  new_meeting: { text: "new meeting", bg: "#e8f0fe", fg: "#1a73e8" },
  reschedule: { text: "reschedule", bg: "#fef3e2", fg: "#7c4a00" },
  cancel: { text: "cancel", bg: "#fde8e8", fg: "#7c1c14" },
};

export function SchedulingProposalCard({
  proposal,
}: SchedulingProposalCardProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const kindBadge = KIND_LABEL[proposal.kind];

  // Pulse a small dot in the header whenever the proposal row updates
  // in Postgres (e.g. agent attached a draft, rewrote slots, marked
  // it sent). Per-row filtered at the Realtime layer.
  const { pulse } = useRowPulse({
    table: "scheduling_proposals",
    rowId: proposal.id,
  });

  // For "cancel" kind there are no real slots to choose; we still let the
  // human confirm by selecting the (single) row representing the existing
  // event. For "new_meeting" and "reschedule" we require an explicit slot
  // choice. The Send & schedule button is also gated on a linked draft so
  // we never confirm scheduling without a paired reply.
  const requiresSlotChoice = proposal.kind !== "cancel";
  const sendEnabled =
    !pending &&
    (selectedSlot !== null || !requiresSlotChoice) &&
    (proposal.linkedDraftId !== null || proposal.kind === "cancel");

  function handleSend() {
    if (requiresSlotChoice && selectedSlot === null) {
      toast.error("Pick a slot first.");
      return;
    }
    if (proposal.kind !== "cancel" && !proposal.linkedDraftId) {
      toast.error("No reply draft linked to this proposal yet.");
      return;
    }
    const slotIndex = selectedSlot ?? 0;
    const slot = proposal.proposedSlots[slotIndex];
    if (!slot) {
      toast.error("Invalid slot.");
      return;
    }
    startTransition(async () => {
      try {
        await approveScheduleAndSend(
          proposal.id,
          { start: slot.start, end: slot.end },
          proposal.linkedDraftId
        );
        toast.success("Scheduling & sending…");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function handleReject() {
    if (!reason.trim()) {
      toast.error("Add a brief reason.");
      return;
    }
    startTransition(async () => {
      try {
        await rejectScheduleSlots(proposal.id, reason.trim());
        toast.success("Slots rejected.");
        setRejecting(false);
        setReason("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
  }

  return (
    <div
      className="rounded-md border px-4 py-3 mt-2"
      style={{
        background: "#ffffff",
        borderColor: "#e0e0e0",
        borderLeftWidth: 3,
        borderLeftColor: "#1a73e8",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[11px] uppercase font-medium"
          style={{ color: "#888" }}
        >
          Scheduling
        </span>
        <span
          className="px-2 py-0.5 rounded text-[11px] uppercase"
          style={{ background: kindBadge.bg, color: kindBadge.fg }}
        >
          {kindBadge.text}
        </span>
        {/* Live-update pulse: flashes when the proposal row updates
            in Postgres via Supabase Realtime. */}
        <span
          aria-hidden={!pulse}
          aria-label={pulse ? "Updated just now" : undefined}
          title={pulse ? "Updated just now" : undefined}
          className="inline-block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: pulse ? "#1a73e8" : "transparent",
            transition: "background 200ms ease-out",
          }}
        />
      </div>

      {/* Title + duration */}
      <div className="text-[14px] font-medium mb-1">
        {proposal.meetingTitle}
      </div>
      <div className="text-[12px] mb-3" style={{ color: "#666" }}>
        {proposal.durationMinutes}-min · {proposal.location} ·{" "}
        {proposal.attendees.join(", ")}
      </div>

      {/* Description */}
      {proposal.meetingDescription && (
        <div
          className="text-[12px] mb-3 whitespace-pre-wrap"
          style={{ color: "#444", lineHeight: 1.5 }}
        >
          {proposal.meetingDescription}
        </div>
      )}

      {/* Slot pills */}
      {requiresSlotChoice && proposal.proposedSlots.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {proposal.proposedSlots.slice(0, 3).map((slot, idx) => {
            const isSelected = selectedSlot === idx;
            return (
              <button
                key={`${slot.start}-${idx}`}
                type="button"
                onClick={() => setSelectedSlot(idx)}
                disabled={pending}
                className="rounded-full px-3 py-1 text-[12px] border"
                style={{
                  background: isSelected ? "#1a73e8" : "#ffffff",
                  color: isSelected ? "#ffffff" : "#222",
                  borderColor: isSelected ? "#1a73e8" : "#e0e0e0",
                }}
              >
                {formatSlot(slot.start, slot.end)}
              </button>
            );
          })}
        </div>
      )}

      {/* Linked-draft missing notice */}
      {proposal.kind !== "cancel" && !proposal.linkedDraftId && (
        <div
          className="mb-3 px-3 py-2 rounded text-[12px]"
          style={{ background: "#fef3e2", color: "#7c4a00" }}
        >
          No reply draft is linked to this proposal yet — the agent will
          attach one before you can send & schedule.
        </div>
      )}

      {/* Reject reason input */}
      {rejecting && (
        <div className="mb-3">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you rejecting these slots? (one line)"
            className="w-full text-[13px] px-2 py-1 rounded border outline-none"
            style={{ borderColor: "#e74c3c" }}
            autoFocus
          />
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2">
        {!rejecting && (
          <>
            <button
              type="button"
              onClick={handleSend}
              disabled={!sendEnabled}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium"
              style={{
                background: "#1a73e8",
                color: "#ffffff",
                opacity: sendEnabled ? 1 : 0.5,
                cursor: sendEnabled ? "pointer" : "not-allowed",
              }}
            >
              {pending ? "Sending…" : "Send & schedule"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-[13px]"
              style={{ color: "#e74c3c" }}
            >
              Reject slots
            </button>
          </>
        )}
        {rejecting && (
          <>
            <button
              type="button"
              onClick={handleReject}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium"
              style={{ background: "#e74c3c", color: "#ffffff" }}
            >
              {pending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
              className="px-3 py-1.5 rounded-md text-[13px]"
              style={{ color: "#888" }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
