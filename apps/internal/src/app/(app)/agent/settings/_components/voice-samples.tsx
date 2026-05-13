"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleVoiceSample } from "../_actions";

export type VoiceSampleRow = {
  messageId: string;
  sentAt: string;
  subject: string | null;
  toEmails: string[];
  preview: string;
  starred: boolean;
};

export type VoiceSampleSuggestion = VoiceSampleRow & {
  score?: number;
};

type Props = {
  mailboxEmail: string;
  samples: VoiceSampleRow[];
  suggestions?: VoiceSampleSuggestion[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function VoiceSamples({
  mailboxEmail,
  samples,
  suggestions = [],
}: Props) {
  const [local, setLocal] = useState(samples);
  const [localSuggestions, setLocalSuggestions] = useState(suggestions);
  const [, startTransition] = useTransition();

  function onToggle(row: VoiceSampleRow, next: boolean) {
    // Optimistic flip
    setLocal((prev) =>
      prev.map((r) =>
        r.messageId === row.messageId ? { ...r, starred: next } : r
      )
    );
    startTransition(async () => {
      try {
        await toggleVoiceSample(row.messageId, next);
        toast.success(next ? "Pinned voice sample." : "Removed voice sample.");
      } catch (err) {
        // Roll back
        setLocal((prev) =>
          prev.map((r) =>
            r.messageId === row.messageId ? { ...r, starred: !next } : r
          )
        );
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function onStarSuggestion(row: VoiceSampleSuggestion) {
    // Optimistic — drop from the suggestion strip and start a transition.
    setLocalSuggestions((prev) =>
      prev.filter((s) => s.messageId !== row.messageId)
    );
    // Also flip starred in the main list if the row happens to be there.
    setLocal((prev) =>
      prev.map((r) =>
        r.messageId === row.messageId ? { ...r, starred: true } : r
      )
    );
    startTransition(async () => {
      try {
        await toggleVoiceSample(row.messageId, true);
        toast.success("Pinned voice sample.");
      } catch (err) {
        // Roll back: restore the suggestion + un-star in local.
        setLocalSuggestions((prev) =>
          prev.some((s) => s.messageId === row.messageId)
            ? prev
            : [...prev, row]
        );
        setLocal((prev) =>
          prev.map((r) =>
            r.messageId === row.messageId ? { ...r, starred: false } : r
          )
        );
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  if (local.length === 0 && localSuggestions.length === 0) {
    return (
      <div
        className="rounded-md border px-4 py-6 text-center text-[12px]"
        style={{ borderColor: "#e0e0e0", color: "#888" }}
      >
        No outbound emails in the last 30 days for{" "}
        <span style={{ color: "#222" }}>{mailboxEmail}</span>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {localSuggestions.length > 0 && (
        <div
          className="rounded-md border overflow-hidden"
          style={{ borderColor: "#e0e0e0" }}
        >
          <div
            className="px-4 py-2 text-[11px] uppercase font-semibold"
            style={{ color: "#888", borderBottom: "1px solid #f0f0f0" }}
          >
            Auto-suggest candidates — top {localSuggestions.length} highest-
            ranked unstarred messages from the last 30 days
          </div>
          <div>
            {localSuggestions.map((row) => (
              <div
                key={row.messageId}
                className="flex items-start gap-3 px-4 py-3 border-b"
                style={{ borderColor: "#f0f0f0" }}
              >
                <button
                  type="button"
                  onClick={() => onStarSuggestion(row)}
                  className="shrink-0"
                  aria-label="Star suggestion"
                  style={{
                    fontSize: 12,
                    lineHeight: "16px",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "#1a73e8",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Star
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span style={{ color: "#888" }}>
                      {formatDate(row.sentAt)}
                    </span>
                    <span style={{ color: "#cccccc" }}>·</span>
                    <span
                      className="truncate"
                      style={{ color: "#555", maxWidth: 280 }}
                    >
                      to {row.toEmails.join(", ") || "(unknown)"}
                    </span>
                    {typeof row.score === "number" && (
                      <>
                        <span style={{ color: "#cccccc" }}>·</span>
                        <span style={{ color: "#888" }}>
                          score {row.score.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: "#1a1a1a" }}
                  >
                    {row.subject || "(no subject)"}
                  </div>
                  {row.preview && (
                    <div
                      className="text-[12px] mt-0.5"
                      style={{ color: "#666", lineHeight: 1.4 }}
                    >
                      {row.preview}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {local.length > 0 && (
    <div
      className="rounded-md border overflow-hidden"
      style={{ borderColor: "#e0e0e0" }}
    >
      <div
        className="px-4 py-2 text-[11px] uppercase font-semibold"
        style={{ color: "#888", borderBottom: "1px solid #f0f0f0" }}
      >
        Star the emails that best represent your voice. The planner uses up
        to 10 starred samples per mailbox.
      </div>
      <div>
        {local.map((row) => (
          <div
            key={row.messageId}
            className="flex items-start gap-3 px-4 py-3 border-b"
            style={{ borderColor: "#f0f0f0" }}
          >
            <button
              type="button"
              onClick={() => onToggle(row, !row.starred)}
              className="shrink-0"
              aria-label={row.starred ? "Unstar" : "Star"}
              style={{
                fontSize: 18,
                lineHeight: "18px",
                color: row.starred ? "#f5a623" : "#cccccc",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {row.starred ? "★" : "☆"}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px]">
                <span style={{ color: "#888" }}>{formatDate(row.sentAt)}</span>
                <span style={{ color: "#cccccc" }}>·</span>
                <span
                  className="truncate"
                  style={{ color: "#555", maxWidth: 280 }}
                >
                  to {row.toEmails.join(", ") || "(unknown)"}
                </span>
              </div>
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: "#1a1a1a" }}
              >
                {row.subject || "(no subject)"}
              </div>
              {row.preview && (
                <div
                  className="text-[12px] mt-0.5"
                  style={{ color: "#666", lineHeight: 1.4 }}
                >
                  {row.preview}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
      )}
    </div>
  );
}
