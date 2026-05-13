import type { Metadata } from "next";
import { Inbox, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent Inbox" };

export default function AgentInboxPage() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Agent Inbox</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            Triage, drafts, scheduling — assisted by the Chief-of-Staff agent.
          </p>
        </div>
      </div>

      <div
        style={{
          borderRadius: 10,
          border: "1px solid #e0e0e0",
          padding: 32,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            background: "#f5f5f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Inbox size={20} color="#888" strokeWidth={1.5} />
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#222" }}>
          Inbox shell — wiring up
        </h2>
        <p style={{ fontSize: 13, color: "#888", maxWidth: 480, lineHeight: 1.5 }}>
          The Chief-of-Staff agent's schema is live (15 tables) and the route
          shell renders. Thread list, classifier, drafts, brief, calendar
          coordination, follow-ups, and analytics land in subsequent slices.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
            fontSize: 12,
            color: "#666",
          }}
        >
          <Sparkles size={13} strokeWidth={1.5} />
          Next: connect a mailbox, then port the ingest pipeline.
        </div>
      </div>
    </div>
  );
}
