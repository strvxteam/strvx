"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveDraftAndSend,
  updateDraftBody,
  rejectDraft,
} from "../_actions";

export type DraftCardProps = {
  draft: {
    id: string;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
    toEmails: string[];
    ccEmails: string[];
    confidence: "high" | "medium" | "low" | null;
    reviewerNotes: string | null;
    humanEdited: boolean;
    status: string;
  };
};

export function DraftCard({ draft }: DraftCardProps) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [bodyText, setBodyText] = useState(draft.bodyText);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const confidenceColor =
    draft.confidence === "high"
      ? { bg: "#e8f5e9", fg: "#1b5e20" }
      : draft.confidence === "medium"
      ? { bg: "#fef3e2", fg: "#7c4a00" }
      : { bg: "#fde8e8", fg: "#7c1c14" };

  function handleSave() {
    startTransition(async () => {
      try {
        await updateDraftBody(draft.id, { subject, bodyText });
        toast.success("Draft updated.");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  function handleSend() {
    startTransition(async () => {
      try {
        if (editing) {
          await updateDraftBody(draft.id, { subject, bodyText });
        }
        await approveDraftAndSend(draft.id);
        toast.success("Sending…");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Send failed");
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
        await rejectDraft(draft.id, reason.trim());
        toast.success("Rejected.");
        setRejecting(false);
        setReason("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
  }

  const borderColor =
    draft.confidence === "low"
      ? "#f39c12"
      : "#e0e0e0";

  return (
    <div
      className="rounded-md border px-4 py-3 mt-2"
      style={{
        background: "#ffffff",
        borderColor,
        borderLeftWidth: draft.confidence === "low" ? 3 : 1,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[11px] uppercase font-medium"
          style={{ color: "#888" }}
        >
          Draft
        </span>
        {draft.confidence && (
          <span
            className="px-2 py-0.5 rounded text-[11px] uppercase"
            style={{ background: confidenceColor.bg, color: confidenceColor.fg }}
          >
            {draft.confidence} confidence
          </span>
        )}
        {draft.humanEdited && (
          <span
            className="px-2 py-0.5 rounded text-[11px]"
            style={{ background: "#e8f0fe", color: "#1a73e8" }}
          >
            edited
          </span>
        )}
      </div>

      {/* Recipients */}
      <div className="text-[12px] mb-2" style={{ color: "#666" }}>
        To: {draft.toEmails.join(", ")}
        {draft.ccEmails.length > 0 && (
          <>
            <br />Cc: {draft.ccEmails.join(", ")}
          </>
        )}
      </div>

      {/* Subject + body */}
      {editing ? (
        <>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full text-[14px] font-medium mb-2 px-2 py-1 rounded border outline-none"
            style={{ borderColor: "#e0e0e0" }}
            placeholder="Subject"
          />
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className="w-full text-[13px] px-2 py-2 rounded border outline-none resize-y"
            style={{ borderColor: "#e0e0e0", minHeight: 180, lineHeight: 1.5 }}
            placeholder="Body"
          />
        </>
      ) : (
        <>
          <div className="text-[14px] font-medium mb-2">{draft.subject}</div>
          <div
            className="text-[13px] whitespace-pre-wrap"
            style={{ color: "#222", lineHeight: 1.5 }}
          >
            {draft.bodyText}
          </div>
        </>
      )}

      {/* Reviewer notes from the agent */}
      {draft.reviewerNotes && !editing && (
        <div
          className="mt-3 px-3 py-2 rounded text-[12px]"
          style={{ background: "#fef3e2", color: "#7c4a00" }}
        >
          <span className="font-medium">Agent notes: </span>
          {draft.reviewerNotes}
        </div>
      )}

      {/* Reject reason input */}
      {rejecting && (
        <div className="mt-3">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you rejecting? (one line)"
            className="w-full text-[13px] px-2 py-1 rounded border outline-none"
            style={{ borderColor: "#e74c3c" }}
            autoFocus
          />
        </div>
      )}

      {/* Action bar */}
      <div className="mt-3 flex items-center gap-2">
        {!rejecting && (
          <>
            <button
              type="button"
              onClick={handleSend}
              disabled={pending}
              data-shortcut="send"
              className="px-3 py-1.5 rounded-md text-[13px] font-medium"
              style={{ background: "#1a73e8", color: "#ffffff", opacity: pending ? 0.6 : 1 }}
            >
              {pending ? "Sending…" : "Send"}
            </button>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending}
                  className="px-3 py-1.5 rounded-md text-[13px]"
                  style={{ background: "#f0f0f0", color: "#222" }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubject(draft.subject);
                    setBodyText(draft.bodyText);
                    setEditing(false);
                  }}
                  className="px-3 py-1.5 rounded-md text-[13px]"
                  style={{ color: "#888" }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-md text-[13px]"
                style={{ background: "#f0f0f0", color: "#222" }}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="px-3 py-1.5 rounded-md text-[13px]"
              style={{ color: "#e74c3c" }}
            >
              Reject
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
