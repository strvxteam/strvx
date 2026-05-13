import { ThreadListPane } from "./_components/thread-list-pane";
import { ThreadDetailPane } from "./_components/thread-detail-pane";
import { KeyboardShortcuts } from "./_components/keyboard-shortcuts";
import {
  fetchActiveMailboxes,
  fetchThreadsForInbox,
  fetchThreadLabels,
  fetchTopLabels,
  type Filter,
  type Sort,
} from "./_queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  thread?: string;
  filter?: string;
  sort?: string;
  mailbox?: string;
}>;

const VALID_FILTERS: Filter[] = [
  "all",
  "unread",
  "needs_you",
  "drafted",
  "stale",
  "snoozed",
  "archived",
];
const VALID_SORTS: Sort[] = ["priority", "recent"];

export default async function AgentInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedThreadId = params.thread;
  const filter = VALID_FILTERS.includes(params.filter as Filter)
    ? (params.filter as Filter)
    : "all";
  const sort = VALID_SORTS.includes(params.sort as Sort)
    ? (params.sort as Sort)
    : "priority";

  const mailboxes = await fetchActiveMailboxes();
  const requestedMailboxId = params.mailbox;
  const mailboxId =
    requestedMailboxId && mailboxes.some((m) => m.id === requestedMailboxId)
      ? requestedMailboxId
      : undefined;

  const threads = await fetchThreadsForInbox({ filter, sort, mailboxId });
  const threadIds = threads.map((t) => t.id);

  // For the label menu (`l` shortcut): top suggested labels + the selected
  // thread's current labels. Both queries are cheap and run in parallel.
  const [topLabels, selectedThreadLabels] = await Promise.all([
    fetchTopLabels(5),
    selectedThreadId ? fetchThreadLabels(selectedThreadId) : Promise.resolve<string[]>([]),
  ]);

  return (
    <div
      className="flex h-full min-h-0 w-full"
      style={{ background: "#f8f8f8" }}
    >
      {/* Left: thread list */}
      <aside
        className="flex shrink-0 flex-col overflow-hidden border-r"
        style={{ width: 320, borderColor: "#e0e0e0", background: "#ffffff" }}
      >
        <ThreadListPane
          threads={threads}
          filter={filter}
          sort={sort}
          selectedThreadId={selectedThreadId}
          mailboxes={mailboxes}
          activeMailboxId={mailboxId}
        />
      </aside>

      {/* Right: thread detail */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ThreadDetailPane threadId={selectedThreadId} />
      </main>

      <KeyboardShortcuts
        threadIds={threadIds}
        topLabels={topLabels}
        selectedThreadLabels={selectedThreadLabels}
        selectedThreadId={selectedThreadId}
      />
    </div>
  );
}
