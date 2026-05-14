"use client";

import { useEffect, useState } from "react";
import type { DisconnectedMailbox } from "./_disconnect-check";

/**
 * Per-session-dismissible site-wide banner. Visibility is keyed by the
 * exact set of disconnected mailbox ids — if a *new* mailbox falls off,
 * the banner re-appears even if the previous one was dismissed.
 */
export function DisconnectBanner({
  mailboxes,
}: {
  mailboxes: DisconnectedMailbox[];
}) {
  const key =
    mailboxes.length === 0
      ? ""
      : mailboxes
          .map((m) => m.id)
          .slice()
          .sort()
          .join(",");

  // Default to visible so SSR renders the banner; we only flip to dismissed
  // after we read sessionStorage on the client. This avoids hiding the
  // banner on first paint for users who haven't dismissed it.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!key) return;
    try {
      const stored = sessionStorage.getItem("strvx:disconnect-banner-dismissed");
      if (stored === key) setDismissed(true);
    } catch {
      // sessionStorage may be unavailable (privacy mode); fall through.
    }
  }, [key]);

  if (mailboxes.length === 0) return null;
  if (dismissed) return null;

  return (
    <div
      style={{
        background: "#fef3c7",
        borderBottom: "1px solid #fcd34d",
        color: "#78350f",
        fontSize: 13,
        padding: "8px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {mailboxes.length === 1
          ? "Mailbox disconnected"
          : `${mailboxes.length} mailboxes disconnected`}
      </span>
      <span>—</span>
      <span>
        {mailboxes.map((mb, i) => (
          <span key={mb.id}>
            {i > 0 ? ", " : ""}
            <span style={{ fontWeight: 600 }}>{mb.email}</span>
          </span>
        ))}{" "}
        needs to reconnect.
      </span>
      <a
        href="/agent/settings?tab=mailboxes"
        style={{
          marginLeft: "auto",
          background: "#92400e",
          color: "#fffbeb",
          padding: "4px 10px",
          borderRadius: 4,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Reconnect →
      </a>
      <button
        type="button"
        aria-label="Dismiss disconnect banner"
        onClick={() => {
          try {
            sessionStorage.setItem(
              "strvx:disconnect-banner-dismissed",
              key
            );
          } catch {
            // ignore — banner will still hide for this render
          }
          setDismissed(true);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "#78350f",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "2px 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}
