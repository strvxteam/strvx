import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db, emailDrafts, emailThreads } from "@strvx/db";
import { DraftsBatchActions } from "./_components/drafts-batch-actions";

export const dynamic = "force-dynamic";

export default async function DraftsQueuePage() {
  // Pending drafts joined to thread for the subject/recipient context.
  const drafts = await db
    .select({
      id: emailDrafts.id,
      threadId: emailDrafts.threadId,
      status: emailDrafts.status,
      subject: emailDrafts.subject,
      toEmails: emailDrafts.toEmails,
      bodyText: emailDrafts.bodyText,
      confidence: emailDrafts.confidence,
      humanEdited: emailDrafts.humanEdited,
      reviewerNotes: emailDrafts.reviewerNotes,
      createdAt: emailDrafts.createdAt,
      threadSubject: emailThreads.subject,
    })
    .from(emailDrafts)
    .leftJoin(emailThreads, eq(emailThreads.id, emailDrafts.threadId))
    .where(sql`${emailDrafts.status} IN ('pending_review', 'approved')`)
    .orderBy(desc(emailDrafts.createdAt));

  const highConfidenceIds = drafts
    .filter((d) => d.confidence === "high" && d.status === "pending_review")
    .map((d) => d.id);

  return (
    <div className="max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold">Drafts queue</h1>
          <p className="text-[13px]" style={{ color: "#888" }}>
            {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} pending review · {highConfidenceIds.length} high-confidence
          </p>
        </div>
        <DraftsBatchActions highConfidenceIds={highConfidenceIds} />
      </div>

      {drafts.length === 0 ? (
        <div
          className="rounded-md border px-6 py-12 text-center text-[13px]"
          style={{ borderColor: "#e0e0e0", background: "#ffffff", color: "#888" }}
        >
          No drafts pending. Nice work.
        </div>
      ) : (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
              <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
                Subject
              </th>
              <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
                Recipient
              </th>
              <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
                Confidence
              </th>
              <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
                Age
              </th>
              <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
                Status
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <DraftRow key={d.id} draft={d} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DraftRow({
  draft,
}: {
  draft: {
    id: string;
    threadId: string;
    status: string;
    subject: string;
    toEmails: string[];
    bodyText: string;
    confidence: "high" | "medium" | "low" | null;
    humanEdited: boolean;
    reviewerNotes: string | null;
    createdAt: Date;
    threadSubject: string | null;
  };
}) {
  const confidenceColor: Record<string, string> = {
    high: "#27ae60",
    medium: "#f39c12",
    low: "#e74c3c",
  };
  const dotColor = draft.confidence ? confidenceColor[draft.confidence] : "#aaaaaa";

  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td className="py-3 pr-3 max-w-md">
        <div className="font-medium truncate">{draft.subject || "(no subject)"}</div>
        <div className="text-[12px] truncate" style={{ color: "#888" }}>
          {draft.bodyText.slice(0, 100)}
        </div>
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#666" }}>
        {draft.toEmails.join(", ")}
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: dotColor }}
          />
          <span className="text-[12px]" style={{ color: "#666" }}>
            {draft.confidence ?? "n/a"}
          </span>
          {draft.humanEdited && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{ background: "#e8f0fe", color: "#1a73e8" }}
            >
              edited
            </span>
          )}
        </div>
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#888" }}>
        {formatAge(draft.createdAt)}
      </td>
      <td className="py-3 pr-3 text-[12px]" style={{ color: "#666" }}>
        {draft.status === "approved" ? "Sending…" : "Pending"}
      </td>
      <td className="py-3 text-right">
        <Link
          href={`/agent-inbox?thread=${draft.threadId}`}
          className="text-[12px]"
          style={{ color: "#1a73e8" }}
        >
          Open thread →
        </Link>
      </td>
    </tr>
  );
}

function formatAge(d: Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
