import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  db,
  agentAutonomyPolicy,
  followUpWatchers,
} from "@strvx/db";
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

type CardKey = "watchers" | "flags" | "advancement";

const VALID_EXPAND: ReadonlySet<CardKey> = new Set([
  "watchers",
  "flags",
  "advancement",
]);

/**
 * /agent/follow-ups — dense single-viewport layout.
 *
 * Header + 4 stat tiles + 3 collapsed-by-default section cards. Each
 * section header shows a count + Show/Hide toggle wired to ?show=.
 */
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const show = parseShow(params.show);
  const kindFilter = parseKind(params.kind);

  // Get the start of today in Pacific Time, expressed as a UTC instant
  // for the SQL comparison. Postgres timestamps are stored UTC, so we
  // compute the boundary in JS to avoid SET TIME ZONE.
  const todayStartPT = startOfTodayPacific(new Date());

  const [watchersAll, flags, advancement, [policyRow], [todayFiredRow]] =
    await Promise.all([
      loadOpenWatchers(),
      loadOpenHygieneFlags(),
      loadStageAdvancementSuggestions(),
      db
        .select({ followUpsEnabled: agentAutonomyPolicy.followUpsEnabled })
        .from(agentAutonomyPolicy)
        .where(eq(agentAutonomyPolicy.id, "global"))
        .limit(1),
      db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(followUpWatchers)
        .where(
          and(
            eq(followUpWatchers.status, "fired"),
            gte(followUpWatchers.firedAt, todayStartPT)
          )
        ),
    ]);

  const followUpsEnabled = policyRow?.followUpsEnabled ?? true;
  const firedToday =
    typeof todayFiredRow?.count === "number"
      ? todayFiredRow.count
      : Number(todayFiredRow?.count) || 0;

  const watcherKinds = uniqueWatcherKinds(watchersAll);
  const watchers = kindFilter
    ? watchersAll.filter((w) => w.kind === kindFilter)
    : watchersAll;

  const watchersExpanded = show === "watchers";
  const flagsExpanded = show === "flags";
  const advancementExpanded = show === "advancement";

  return (
    <main
      className="px-8 py-6"
      style={{ maxWidth: 1080, marginInline: "auto" }}
    >
      {!followUpsEnabled && <KillSwitchBanner />}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[18px] font-semibold" style={{ color: "#111" }}>
            Follow-ups
          </h1>
          <p className="text-[12px]" style={{ color: "#888" }}>
            Proactive watchers, CRM hygiene, and stage signals.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4"
        style={{ fontSize: 12 }}
      >
        <StatCard
          label="Open watchers"
          value={String(watchersAll.length)}
        />
        <StatCard
          label="Open hygiene flags"
          value={String(flags.length)}
        />
        <StatCard
          label="Stage suggestions"
          value={String(advancement.length)}
        />
        <StatCard
          label="Auto-firing today"
          value={String(firedToday)}
          sub={
            followUpsEnabled
              ? "Stale + no-show"
              : "Autonomy paused"
          }
        />
      </div>

      {/* Open watchers — collapsed by default */}
      <CollapsibleSection
        title="Open watchers"
        sectionId="watchers-section"
        count={watchersAll.length}
        expanded={watchersExpanded}
        expandHref={
          kindFilter
            ? `/agent/follow-ups?show=watchers&kind=${kindFilter}`
            : "/agent/follow-ups?show=watchers"
        }
        collapseHref={
          kindFilter
            ? `/agent/follow-ups?kind=${kindFilter}`
            : "/agent/follow-ups"
        }
      >
        {watcherKinds.length > 1 && (
          <KindFilterChips kinds={watcherKinds} active={kindFilter} />
        )}
        {watchers.length === 0 ? (
          <EmptyState label="No open watchers." />
        ) : (
          <WatchersTable rows={watchers} />
        )}
      </CollapsibleSection>

      {/* CRM hygiene flags — collapsed by default */}
      <CollapsibleSection
        title="CRM hygiene flags"
        sectionId="flags-section"
        count={flags.length}
        expanded={flagsExpanded}
        expandHref="/agent/follow-ups?show=flags"
        collapseHref="/agent/follow-ups"
      >
        {flags.length === 0 ? (
          <EmptyState label="No open hygiene flags." />
        ) : (
          <FlagsTable rows={flags} />
        )}
      </CollapsibleSection>

      {/* Stage-advancement suggestions — collapsed by default */}
      <CollapsibleSection
        title="Stage-advancement suggestions"
        sectionId="advancement-section"
        count={advancement.length}
        expanded={advancementExpanded}
        expandHref="/agent/follow-ups?show=advancement"
        collapseHref="/agent/follow-ups"
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

function parseShow(s: string | undefined): CardKey | null {
  if (!s) return null;
  return VALID_EXPAND.has(s as CardKey) ? (s as CardKey) : null;
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

/**
 * Returns the start of today in America/Los_Angeles, expressed as a
 * UTC Date. Avoids pulling in a tz library — uses Intl.DateTimeFormat
 * with the en-CA locale (YYYY-MM-DD) for a deterministic format.
 */
function startOfTodayPacific(now: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  const ss = Number(get("second"));
  // Pacific midnight in UTC = now - (Pacific-now-time-of-day).
  const offsetMs = ((hh * 60 + mm) * 60 + ss) * 1000;
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  return new Date(utcMs + (now.getTime() - (utcMs + offsetMs)));
}

function KillSwitchBanner() {
  return (
    <div
      className="rounded-md px-4 py-3 mb-6 flex items-center gap-3"
      style={{
        background: "#fef8e7",
        border: "1px solid #f5d76e",
        color: "#7c4a00",
        fontSize: 13,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>⏸</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Follow-up autonomy paused.
        </div>
        <div style={{ color: "#7c4a00", opacity: 0.85 }}>
          Stale-thread and no-show nudges are not being dispatched.{" "}
          <Link
            href="/agent/settings"
            style={{ color: "#7c4a00", textDecoration: "underline" }}
          >
            Re-enable in /agent/settings
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: "#e0e0e0",
        background: "#ffffff",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        height: 78,
      }}
    >
      <div
        className="uppercase font-semibold"
        style={{
          color: "#888",
          letterSpacing: 0.4,
          fontSize: 10,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        className="font-semibold"
        style={{
          color: "#1a1a1a",
          fontSize: 20,
          lineHeight: 1.15,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            color: "#888",
            fontSize: 11,
            lineHeight: 1.2,
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  expanded,
  expandHref,
  collapseHref,
  sectionId,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  expandHref: string;
  collapseHref: string;
  sectionId: string;
  children: React.ReactNode;
}) {
  const bodyId = `${sectionId}-body`;
  return (
    <section
      className="mb-2 rounded-md overflow-hidden"
      style={{ border: "1px solid #e0e0e0", background: "#ffffff" }}
    >
      <Link
        href={expanded ? collapseHref : expandHref}
        role="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex items-center justify-between"
        style={{
          background: "#f4f5f7",
          borderBottom: expanded ? "1px solid #e0e0e0" : "none",
          color: "#222",
          fontSize: 12,
          padding: "10px 14px",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          <span
            className="rounded text-[10px]"
            style={{
              background: "#ffffff",
              border: "1px solid #e0e0e0",
              color: "#666",
              padding: "1px 6px",
              fontWeight: 600,
            }}
            aria-hidden="true"
          >
            {count}
          </span>
          <span className="sr-only">({count} items)</span>
        </div>
        <span
          className="text-[11px]"
          style={{ color: "#1a73e8", fontWeight: 500 }}
          aria-hidden="true"
        >
          {expanded ? "Hide" : "Show"}
        </span>
      </Link>
      {expanded && (
        <div
          id={bodyId}
          style={{ padding: "12px 16px 14px", overflowX: "auto" }}
        >
          {children}
        </div>
      )}
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
        href="/agent/follow-ups"
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
          href={`/agent/follow-ups?kind=${k}`}
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
    <table className="w-full text-[13px] border-collapse" style={{ tableLayout: "fixed", minWidth: 720 }}>
      <colgroup>
        <col />
        <col style={{ width: 110 }} />
        <col style={{ width: 130 }} />
        <col style={{ width: 130 }} />
        <col style={{ width: 180 }} />
      </colgroup>
      <thead>
        <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Subject / engagement
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Status
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Kind
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
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
    <table className="w-full text-[13px] border-collapse" style={{ tableLayout: "fixed", minWidth: 720 }}>
      <colgroup>
        <col />
        <col style={{ width: 160 }} />
        <col style={{ width: 110 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 140 }} />
      </colgroup>
      <thead>
        <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Entity
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Kind
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Entity type
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
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
    <table className="w-full text-[13px] border-collapse" style={{ tableLayout: "fixed", minWidth: 720 }}>
      <colgroup>
        <col />
        <col style={{ width: 220 }} />
        <col style={{ width: 130 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 160 }} />
      </colgroup>
      <thead>
        <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Engagement / thread
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Transition
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
            Signal
          </th>
          <th
            className="text-left py-2 font-medium text-[11px] uppercase"
            style={{ color: "#888" }}
          >
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
// trigger
