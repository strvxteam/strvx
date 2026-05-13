import Link from "next/link";
import { fetchThreadsForInbox, type Filter, type Sort } from "../_queries";
import { SearchBar } from "./search-bar";

type Thread = Awaited<ReturnType<typeof fetchThreadsForInbox>>[number];

// ── Helpers ────────────────────────────────────────────────────────────────

function senderDisplay(participants: unknown): string {
  if (!Array.isArray(participants)) return "(unknown)";
  const external = participants.find(
    (p) =>
      (p as { role?: string }).role === "external" ||
      (p as { role?: string }).role === "from"
  ) as { email?: string; name?: string } | undefined;
  if (external) return external.name || external.email || "(unknown)";
  const first = participants[0] as
    | { email?: string; name?: string }
    | undefined;
  return first?.name || first?.email || "(unknown)";
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const URGENCY_DOT: Record<string, string> = {
  urgent: "#e53e3e",
  normal: "#3b82f6",
  low: "#9ca3af",
};

function isSnoozedFuture(thread: {
  agentState?: string | null;
  snoozedUntil?: Date | string | null;
}): boolean {
  if (thread.agentState !== "snoozed") return false;
  if (!thread.snoozedUntil) return false;
  const t =
    thread.snoozedUntil instanceof Date
      ? thread.snoozedUntil.getTime()
      : new Date(thread.snoozedUntil).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

function formatSnoozeCountdown(value: Date | string | null | undefined): string {
  if (!value) return "Snoozed";
  const target = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(target.getTime())) return "Snoozed";
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return "Snoozed";
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.round(hr / 24);
  return `${days}d`;
}

function formatSnoozeUntil(value: Date | string | null | undefined): string {
  if (!value) return "";
  const target = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(target.getTime())) return "";
  return target.toLocaleString();
}

// ── Filter definitions ─────────────────────────────────────────────────────

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "needs_you", label: "Needs You" },
  { key: "drafted", label: "Drafted" },
  { key: "stale", label: "Stale" },
  { key: "snoozed", label: "Snoozed" },
  { key: "archived", label: "Archived" },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function FilterBar({
  activeFilter,
  sort,
  mailboxId,
}: {
  activeFilter: Filter;
  sort: Sort;
  mailboxId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FILTERS.map(({ key, label }) => {
        const isActive = key === activeFilter;
        const params = new URLSearchParams({ filter: key, sort });
        if (mailboxId) params.set("mailbox", mailboxId);
        return (
          <Link
            key={key}
            href={`/agent-inbox?${params.toString()}`}
            prefetch={false}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 99,
              fontWeight: isActive ? 600 : 400,
              background: isActive ? "#1a1a1a" : "#f0f0f0",
              color: isActive ? "#ffffff" : "#555555",
              textDecoration: "none",
              display: "inline-block",
              lineHeight: "18px",
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function mailboxLabel(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function MailboxPills({
  mailboxes,
  activeMailboxId,
  filter,
  sort,
}: {
  mailboxes: Array<{ id: string; email: string }>;
  activeMailboxId?: string;
  filter: Filter;
  sort: Sort;
}) {
  if (mailboxes.length === 0) return null;

  const makeHref = (id?: string): string => {
    const params = new URLSearchParams({ filter, sort });
    if (id) params.set("mailbox", id);
    return `/agent-inbox?${params.toString()}`;
  };

  const allActive = !activeMailboxId;

  return (
    <div className="flex flex-wrap gap-1">
      <Link
        href={makeHref(undefined)}
        prefetch={false}
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 99,
          fontWeight: allActive ? 600 : 400,
          background: allActive ? "#e8f0fe" : "#f5f5f5",
          color: allActive ? "#1a56db" : "#555555",
          textDecoration: "none",
          display: "inline-block",
          lineHeight: "18px",
        }}
      >
        All
      </Link>
      {mailboxes.map((m) => {
        const isActive = m.id === activeMailboxId;
        return (
          <Link
            key={m.id}
            href={makeHref(m.id)}
            prefetch={false}
            title={m.email}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 99,
              fontWeight: isActive ? 600 : 400,
              background: isActive ? "#e8f0fe" : "#f5f5f5",
              color: isActive ? "#1a56db" : "#555555",
              textDecoration: "none",
              display: "inline-block",
              lineHeight: "18px",
            }}
          >
            {mailboxLabel(m.email)}
          </Link>
        );
      })}
    </div>
  );
}

type ThreadRow = Thread;

function ThreadRow({
  thread,
  selected,
  filter,
  sort,
  mailboxId,
}: {
  thread: ThreadRow;
  selected: boolean;
  filter: Filter;
  sort: Sort;
  mailboxId?: string;
}) {
  const sender = senderDisplay(thread.participants);
  const subject = thread.subject ?? "(no subject)";
  const relTime = thread.lastMessageAt
    ? formatRelative(new Date(thread.lastMessageAt))
    : "";
  const urgencyColor =
    thread.agentUrgency ? (URGENCY_DOT[thread.agentUrgency] ?? "#9ca3af") : "#e0e0e0";

  const linkParams = new URLSearchParams({
    thread: thread.id,
    filter,
    sort,
  });
  if (mailboxId) linkParams.set("mailbox", mailboxId);

  return (
    <Link
      href={`/agent-inbox?${linkParams.toString()}`}
      prefetch={false}
      className="block border-b hover:bg-[#f5f5f5]"
      style={{
        borderColor: "#f0f0f0",
        background: selected ? "#e8f0fe" : undefined,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div className="px-4 py-3">
        {/* Top row: sender + timestamp + urgency dot */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-[13px] font-semibold"
            style={{ color: "#1a1a1a", maxWidth: "160px" }}
          >
            {sender}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span style={{ fontSize: 11, color: "#aaaaaa", whiteSpace: "nowrap" }}>
              {relTime}
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: urgencyColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
          </div>
        </div>

        {/* Subject */}
        <div
          className="mt-0.5 truncate text-[12px]"
          style={{ color: "#555555" }}
        >
          {subject}
        </div>

        {/* Label chips */}
        {Array.isArray(thread.labels) && thread.labels.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {thread.labels.map((label) => (
              <span
                key={label}
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "#f5f5f5",
                  color: "#666",
                  lineHeight: "14px",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Chips row */}
        {(thread.requiresHuman ||
          thread.engagementId ||
          isSnoozedFuture(thread)) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {thread.requiresHuman && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "#fff3cd",
                  color: "#856404",
                  fontWeight: 600,
                }}
              >
                Needs you
              </span>
            )}
            {isSnoozedFuture(thread) && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "#ede7f6",
                  color: "#5e35b1",
                  fontWeight: 600,
                }}
                title={`Snoozed until ${formatSnoozeUntil(thread.snoozedUntil)}`}
              >
                💤 {formatSnoozeCountdown(thread.snoozedUntil)}
              </span>
            )}
            {thread.engagementId && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "#e8f0fe",
                  color: "#1a56db",
                  fontWeight: 600,
                }}
              >
                Linked
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Main exported component ────────────────────────────────────────────────

export function ThreadListPane({
  threads,
  filter,
  sort,
  selectedThreadId,
  mailboxes,
  activeMailboxId,
}: {
  threads: Thread[];
  filter: Filter;
  sort: Sort;
  selectedThreadId?: string;
  mailboxes: Array<{ id: string; email: string }>;
  activeMailboxId?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Header + filter bar */}
      <div
        className="shrink-0 border-b px-3 pb-2 pt-3"
        style={{ borderColor: "#e0e0e0" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[14px] font-semibold" style={{ color: "#1a1a1a" }}>
            Inbox
          </span>
          <span className="text-[11px]" style={{ color: "#888888" }}>
            {threads.length}
          </span>
        </div>
        <div className="mb-2">
          <SearchBar />
        </div>
        {mailboxes.length > 0 && (
          <div className="mb-2">
            <MailboxPills
              mailboxes={mailboxes}
              activeMailboxId={activeMailboxId}
              filter={filter}
              sort={sort}
            />
          </div>
        )}
        <FilterBar activeFilter={filter} sort={sort} mailboxId={activeMailboxId} />
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-auto">
        {threads.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-[13px]"
            style={{ color: "#aaaaaa" }}
          >
            No threads in {filter}.
          </div>
        ) : (
          threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              selected={t.id === selectedThreadId}
              filter={filter}
              sort={sort}
              mailboxId={activeMailboxId}
            />
          ))
        )}
      </div>
    </div>
  );
}
