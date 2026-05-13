import Link from "next/link";
import {
  loadOpenWatchers,
  loadOpenHygieneFlags,
  loadStageAdvancementSuggestions,
  uniqueWatcherKinds,
  type WatcherKind,
} from "./_queries";
import { WatcherRow } from "./_components/watcher-row";
import {
  HygieneFlagRowView,
  StageAdvancementFlagRow,
} from "./_components/flag-row";

export const dynamic = "force-dynamic";

type Section = "watchers" | "flags" | "advancement";

const VALID_SECTIONS: ReadonlySet<Section> = new Set([
  "watchers",
  "flags",
  "advancement",
]);

/**
 * /agent/follow-ups — three collapsible sections:
 *   1. Open watchers (follow_up_watchers status IN (pending,fired))
 *   2. CRM hygiene flags (open, kind != stage_advancement_suggested)
 *   3. Stage-advancement suggestions
 *
 * Section expansion + watcher-kind filter are query-param driven so the page
 * stays a pure RSC. Admin gate inherits from src/app/(app)/agent/layout.tsx.
 */
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const section = parseSection(params.section);
  const kindFilter = parseKind(params.kind);

  const [watchersAll, flags, advancement] = await Promise.all([
    loadOpenWatchers(),
    loadOpenHygieneFlags(),
    loadStageAdvancementSuggestions(),
  ]);

  const watcherKinds = uniqueWatcherKinds(watchersAll);
  const watchers = kindFilter
    ? watchersAll.filter((w) => w.kind === kindFilter)
    : watchersAll;

  return (
    <main
      className="px-8 py-10"
      style={{ maxWidth: 1080, marginInline: "auto" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "#111" }}>
            Follow-ups
          </h1>
          <p className="text-[13px]" style={{ color: "#888" }}>
            {watchersAll.length} open watchers · {flags.length} hygiene flags ·{" "}
            {advancement.length} stage suggestions
          </p>
        </div>
      </div>

      <CollapsibleSection
        title="Open watchers"
        count={watchersAll.length}
        expanded={section === "watchers"}
        href={section === "watchers" ? "/agent/follow-ups" : "/agent/follow-ups?section=watchers"}
      >
        {watcherKinds.length > 1 && section === "watchers" && (
          <KindFilterChips
            kinds={watcherKinds}
            active={kindFilter}
          />
        )}
        {watchers.length === 0 ? (
          <EmptyState label="No open watchers." />
        ) : (
          <WatchersTable rows={watchers} />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="CRM hygiene flags"
        count={flags.length}
        expanded={section === "flags"}
        href={section === "flags" ? "/agent/follow-ups" : "/agent/follow-ups?section=flags"}
      >
        {flags.length === 0 ? (
          <EmptyState label="No open hygiene flags." />
        ) : (
          <FlagsTable rows={flags} />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Stage-advancement suggestions"
        count={advancement.length}
        expanded={section === "advancement"}
        href={section === "advancement" ? "/agent/follow-ups" : "/agent/follow-ups?section=advancement"}
      >
        {advancement.length === 0 ? (
          <EmptyState label="No stage suggestions waiting." />
        ) : (
          <AdvancementTable rows={advancement} />
        )}
      </CollapsibleSection>
    </main>
  );
}

function parseSection(s: string | undefined): Section | null {
  if (!s) return null;
  return VALID_SECTIONS.has(s as Section) ? (s as Section) : null;
}

function parseKind(k: string | undefined): WatcherKind | null {
  if (!k) return null;
  const valid: WatcherKind[] = [
    "stale_thread",
    "stale_pipeline",
    "no_show",
    "post_meeting_followup",
  ];
  return (valid as string[]).includes(k) ? (k as WatcherKind) : null;
}

function CollapsibleSection({
  title,
  count,
  expanded,
  href,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-4 rounded-md"
      style={{ border: "1px solid #e0e0e0", background: "#ffffff" }}
    >
      <Link
        href={href}
        className="flex items-center justify-between px-4 py-3 text-[13px]"
        style={{
          background: expanded ? "#fafafa" : "#ffffff",
          borderBottom: expanded ? "1px solid #e0e0e0" : "none",
          color: "#222",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: "#888" }}>{expanded ? "▾" : "▸"}</span>
          <span className="font-semibold">{title}</span>
          <span
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{ background: "#f0f0f0", color: "#666" }}
          >
            {count}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "#888" }}>
          {expanded ? "collapse" : "expand"}
        </span>
      </Link>
      {expanded && <div className="px-4 py-3">{children}</div>}
    </section>
  );
}

function KindFilterChips({
  kinds,
  active,
}: {
  kinds: WatcherKind[];
  active: WatcherKind | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Link
        href="/agent/follow-ups?section=watchers"
        className="px-2 py-1 rounded text-[12px]"
        style={{
          background: active === null ? "#111" : "#f0f0f0",
          color: active === null ? "#fff" : "#666",
        }}
      >
        All
      </Link>
      {kinds.map((k) => (
        <Link
          key={k}
          href={`/agent/follow-ups?section=watchers&kind=${k}`}
          className="px-2 py-1 rounded text-[12px]"
          style={{
            background: active === k ? "#111" : "#f0f0f0",
            color: active === k ? "#fff" : "#666",
          }}
        >
          {k.replace(/_/g, " ")}
        </Link>
      ))}
    </div>
  );
}

function WatchersTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof loadOpenWatchers>>;
}) {
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Subject / engagement
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Status
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Kind
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Triggers
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <WatcherRow key={r.id} row={r} />
        ))}
      </tbody>
    </table>
  );
}

function FlagsTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof loadOpenHygieneFlags>>;
}) {
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Entity
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Kind
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Entity type
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Age
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <HygieneFlagRowView key={r.id} row={r} />
        ))}
      </tbody>
    </table>
  );
}

function AdvancementTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof loadStageAdvancementSuggestions>>;
}) {
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Engagement / thread
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Transition
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Signal
          </th>
          <th className="text-left py-2 font-medium text-[11px] uppercase" style={{ color: "#888" }}>
            Age
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <StageAdvancementFlagRow key={r.id} row={r} />
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="rounded-md px-6 py-8 text-center text-[13px]"
      style={{
        border: "1px solid #f0f0f0",
        background: "#fafafa",
        color: "#888",
      }}
    >
      {label}
    </div>
  );
}
