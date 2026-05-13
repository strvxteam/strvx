import { desc, gte } from "drizzle-orm";
import Link from "next/link";
import { db, dailyBriefs } from "@strvx/db";
import { todayInPT } from "@/lib/agent/brief/inputs";
import { BriefMarkdown } from "./_components/brief-markdown";
import { GenerateButton } from "./_components/generate-button";

export const dynamic = "force-dynamic";

type BriefRow = {
  id: string;
  date: string;
  contentMarkdown: string;
  generatedAt: Date;
};

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;

  // Last 30 days of briefs for the rail.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceDate = since.toISOString().slice(0, 10);

  const briefs: BriefRow[] = await db
    .select({
      id: dailyBriefs.id,
      date: dailyBriefs.date,
      contentMarkdown: dailyBriefs.contentMarkdown,
      generatedAt: dailyBriefs.generatedAt,
    })
    .from(dailyBriefs)
    .where(gte(dailyBriefs.date, sinceDate))
    .orderBy(desc(dailyBriefs.date));

  const today = todayInPT(new Date());
  // Selected: explicit ?date= → that brief; otherwise latest available; falls back to today.
  const selected: BriefRow | undefined = params.date
    ? briefs.find((b) => b.date === params.date)
    : briefs[0];
  const showingDate = selected?.date ?? today;
  const isToday = showingDate === today;
  const todaysBriefExists = briefs.some((b) => b.date === today);

  return (
    <div className="flex" style={{ height: "calc(100vh - 0px)" }}>
      {/* Left rail — list of past briefs */}
      <aside
        className="shrink-0 overflow-y-auto"
        style={{
          width: 240,
          borderRight: "1px solid #e0e0e0",
          background: "#fafafa",
        }}
      >
        <div
          className="px-4 py-4"
          style={{ borderBottom: "1px solid #e0e0e0" }}
        >
          <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Daily briefs
          </h2>
          <p className="text-[12px] mt-1" style={{ color: "#888" }}>
            Last 30 days
          </p>
        </div>
        {briefs.length === 0 ? (
          <div className="px-4 py-6 text-[12px]" style={{ color: "#888" }}>
            No briefs yet.
          </div>
        ) : (
          <nav className="flex flex-col">
            {briefs.map((b) => {
              const isActive = b.id === selected?.id;
              return (
                <Link
                  key={b.id}
                  href={`/agent/brief?date=${b.date}`}
                  className="px-4 py-2 text-[13px] transition-colors"
                  style={{
                    background: isActive ? "#ffffff" : "transparent",
                    borderLeft: isActive ? "2px solid #111" : "2px solid transparent",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#111" : "#444",
                  }}
                >
                  <div>{formatDate(b.date)}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#888" }}>
                    {b.date === today ? "Today" : relativeDays(b.date, today)}
                  </div>
                </Link>
              );
            })}
          </nav>
        )}
      </aside>

      {/* Main pane */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-8 py-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[20px] font-semibold">
                Morning brief — {formatDate(showingDate)}
              </h1>
              {selected && (
                <p className="text-[13px]" style={{ color: "#888" }}>
                  Generated {formatTime(selected.generatedAt)}
                </p>
              )}
            </div>
            {isToday && !todaysBriefExists && <GenerateButton />}
          </div>

          {selected ? (
            <BriefMarkdown content={selected.contentMarkdown} />
          ) : (
            <div
              className="rounded-md border px-6 py-12 text-center text-[13px]"
              style={{ borderColor: "#e0e0e0", background: "#ffffff", color: "#666" }}
            >
              <p className="font-medium" style={{ color: "#222" }}>
                Brief not generated yet
              </p>
              <p className="mt-1" style={{ color: "#888" }}>
                {isToday
                  ? "The 07:00 PT cron hasn't run, or there's no data yet."
                  : "No brief exists for this date."}
              </p>
              {isToday && (
                <div className="mt-4 inline-block">
                  <GenerateButton />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD; parse as UTC to avoid TZ shifts in display.
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(d: Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
}

function relativeDays(dateStr: string, today: string): string {
  const [y1, m1, d1] = dateStr.split("-").map((n) => parseInt(n, 10));
  const [y2, m2, d2] = today.split("-").map((n) => parseInt(n, 10));
  const ms =
    Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (days === 1) return "Yesterday";
  if (days > 1) return `${days} days ago`;
  return "";
}
