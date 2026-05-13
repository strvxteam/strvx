import {
  fetchThreadDetail,
  fetchPendingDraftsForThread,
  fetchPendingProposalsForThread,
  markThreadReadServerSide,
} from "../_queries";
import { ReplyButton } from "./reply-button";
import { DraftCard } from "./draft-card";
import { SchedulingProposalCard } from "./scheduling-proposal-card";
import { AgentThinkingIndicator } from "./agent-thinking-indicator";

export async function ThreadDetailPane({ threadId }: { threadId?: string }) {
  if (!threadId) {
    return (
      <div
        className="flex h-full items-center justify-center text-[13px]"
        style={{ color: "#aaaaaa" }}
      >
        Select a thread.
      </div>
    );
  }

  const detail = await fetchThreadDetail(threadId);

  if (!detail) {
    return (
      <div
        className="flex h-full items-center justify-center text-[13px]"
        style={{ color: "#aaaaaa" }}
      >
        Thread not found.
      </div>
    );
  }

  // Fire-and-forget mark-read. We don't await in the render path because it
  // does a network call to Gmail; instead we let it run in the background.
  // The page is force-dynamic; on next render the is_unread flags will be false.
  void markThreadReadServerSide(threadId, detail.thread.mailboxId);

  const [drafts, proposals] = await Promise.all([
    fetchPendingDraftsForThread(threadId),
    fetchPendingProposalsForThread(threadId),
  ]);

  const { thread, messages, classification, engagement } = detail;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="shrink-0 border-b px-6 py-4"
        style={{ borderColor: "#e0e0e0", background: "#ffffff" }}
      >
        <div className="mb-1 truncate text-[16px] font-semibold">
          {thread.subject || "(no subject)"}
        </div>
        <div
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "#888" }}
        >
          <span>
            {thread.messageCount}{" "}
            {thread.messageCount === 1 ? "message" : "messages"}
          </span>
          <AgentThinkingIndicator threadId={thread.id} />
          {engagement && (
            <>
              <span>·</span>
              <span
                className="rounded px-2 py-0.5"
                style={{ background: "#e8f0fe", color: "#1a73e8" }}
              >
                {engagement.companyName
                  ? `${engagement.companyName} — ${engagement.name}`
                  : engagement.name}
              </span>
            </>
          )}
          {thread.requiresHuman && (
            <>
              <span>·</span>
              <span
                className="rounded px-2 py-0.5"
                style={{ background: "#fef3e2", color: "#f39c12" }}
              >
                needs you
              </span>
            </>
          )}
        </div>
        {messages.length > 0 && (
          <div className="mt-3">
            <ReplyButton
              initial={{
                threadId: thread.id,
                toEmails: deriveReplyToList(messages, thread),
                ccEmails: deriveReplyCcList(messages),
                subject: deriveReplySubject(thread.subject),
              }}
            />
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-auto px-6 py-4"
        style={{ background: "#f8f8f8" }}
      >
        <div className="flex flex-col gap-4">
          {messages.length === 0 ? (
            <div className="text-[13px]" style={{ color: "#aaaaaa" }}>
              No messages.
            </div>
          ) : (
            messages.map((m) => <MessageCard key={m.id} message={m} />)
          )}

          {/* Agent panel — sits below the latest message */}
          {classification && <AgentPanel classification={classification} />}

          {/* Pending scheduling proposals — rendered ABOVE drafts so the
              human picks a slot before/while reviewing the reply text. */}
          {proposals.map((p) => (
            <SchedulingProposalCard
              key={p.id}
              proposal={{
                id: p.id,
                kind: p.kind,
                meetingTitle: p.meetingTitle,
                meetingDescription: p.meetingDescription,
                durationMinutes: p.durationMinutes,
                proposedSlots: p.proposedSlots,
                attendees: p.attendees,
                location: p.location,
                linkedDraftId: p.linkedDraftId,
              }}
            />
          ))}

          {/* Pending agent drafts awaiting review */}
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={{
                id: d.id,
                subject: d.subject,
                bodyText: d.bodyText,
                bodyHtml: d.bodyHtml,
                toEmails: d.toEmails,
                ccEmails: d.ccEmails,
                confidence: (d.confidence ?? null) as "high" | "medium" | "low" | null,
                reviewerNotes: d.reviewerNotes,
                humanEdited: d.humanEdited,
                status: d.status,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type Message = NonNullable<
  Awaited<ReturnType<typeof fetchThreadDetail>>
>["messages"][number];

function MessageCard({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{
        background: "#ffffff",
        borderColor: "#e0e0e0",
        marginLeft: isOutbound ? 48 : 0,
        marginRight: isOutbound ? 0 : 48,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-medium">
          {message.fromName || message.fromEmail}
          {message.fromName && (
            <span className="ml-2 font-normal" style={{ color: "#888" }}>
              &lt;{message.fromEmail}&gt;
            </span>
          )}
        </div>
        <div className="text-[11px]" style={{ color: "#aaaaaa" }}>
          {formatMessageTimestamp(message.sentAt)}
        </div>
      </div>
      <div
        className="whitespace-pre-wrap text-[13px]"
        style={{ color: "#222222", lineHeight: 1.5 }}
      >
        {message.bodyText || message.snippet || "(empty)"}
      </div>
    </div>
  );
}

type Classification = NonNullable<
  Awaited<ReturnType<typeof fetchThreadDetail>>
>["classification"];

function AgentPanel({
  classification,
}: {
  classification: NonNullable<Classification>;
}) {
  const categoryColors: Record<string, { bg: string; fg: string }> = {
    lead_inquiry: { bg: "#e8f0fe", fg: "#1a73e8" },
    client_active: { bg: "#e8f5e9", fg: "#27ae60" },
    client_followup: { bg: "#fef3e2", fg: "#f39c12" },
    vendor: { bg: "#f0f0f0", fg: "#666666" },
    personal: { bg: "#f0f0f0", fg: "#666666" },
    newsletter: { bg: "#f0f0f0", fg: "#888888" },
    spam: { bg: "#fde8e8", fg: "#e74c3c" },
    calendar_invite: { bg: "#e8f0fe", fg: "#1a73e8" },
    scheduling_request: { bg: "#e8f0fe", fg: "#1a73e8" },
    other: { bg: "#f0f0f0", fg: "#666666" },
  };
  const c = categoryColors[classification.category] ?? categoryColors.other;

  const urgencyColors: Record<string, string> = {
    urgent: "#e74c3c",
    normal: "#888888",
    low: "#aaaaaa",
  };

  return (
    <div
      className="mt-2 rounded-md border px-4 py-3"
      style={{ background: "#ffffff", borderColor: "#e0e0e0" }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="text-[11px] font-medium uppercase"
          style={{ color: "#888" }}
        >
          Agent
        </span>
        <span
          className="rounded px-2 py-0.5 text-[11px] uppercase"
          style={{ background: c.bg, color: c.fg }}
        >
          {classification.category.replace(/_/g, " ")}
        </span>
        <span
          className="flex items-center gap-1 text-[11px]"
          style={{ color: "#888" }}
        >
          <span
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              background:
                urgencyColors[classification.urgency] ?? "#aaaaaa",
            }}
          />
          {classification.urgency}
        </span>
        <span className="text-[11px]" style={{ color: "#888" }}>
          · {classification.intent.replace(/_/g, " ")}
        </span>
        {classification.requiresReply && (
          <span
            className="rounded px-2 py-0.5 text-[11px]"
            style={{ background: "#fef3e2", color: "#f39c12" }}
          >
            reply needed
          </span>
        )}
      </div>
      {classification.reasoning && (
        <div
          className="text-[12px]"
          style={{ color: "#666666", lineHeight: 1.5 }}
        >
          {classification.reasoning}
        </div>
      )}
    </div>
  );
}

type ThreadRow = NonNullable<
  Awaited<ReturnType<typeof fetchThreadDetail>>
>["thread"];

function deriveReplyToList(
  messages: { fromEmail: string; direction: string }[],
  thread: ThreadRow
): string[] {
  // Latest inbound message's fromEmail is the primary recipient.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === "inbound" && messages[i].fromEmail) {
      return [messages[i].fromEmail];
    }
  }
  // Fallback: external participant.
  if (Array.isArray(thread.participants)) {
    const external = (thread.participants as { role?: string; email?: string }[]).find(
      (p) => p.role === "external"
    );
    if (external?.email) return [external.email];
  }
  return [];
}

function deriveReplyCcList(
  messages: { ccEmails: string[] | null | undefined; direction: string }[]
): string[] {
  // Use the latest inbound message's Cc list, deduped.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === "inbound") {
      return [...new Set(messages[i].ccEmails ?? [])];
    }
  }
  return [];
}

function deriveReplySubject(subject?: string | null): string {
  if (!subject) return "";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function formatMessageTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return (
      d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    );
  }
  return d.toLocaleDateString();
}
