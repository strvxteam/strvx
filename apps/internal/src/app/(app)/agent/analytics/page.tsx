import {
  fetchAnalyticsSummary,
  fetchAnalyticsPerKind,
  fetchAnalyticsPerMailbox,
  fetchAnalyticsSparklines,
  type DailyBucket,
  type PerMailboxRow,
} from "./_queries";

export const dynamic = "force-dynamic";

function formatUsd(v: number): string {
  return `$${v.toFixed(2)}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function Sparkline({
  buckets,
  width = 240,
  height = 32,
}: {
  buckets: DailyBucket[];
  width?: number;
  height?: number;
}) {
  if (buckets.length === 0) return null;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const stepX = width / Math.max(buckets.length - 1, 1);
  const points = buckets
    .map((b, i) => {
      const x = i * stepX;
      const y = height - (b.count / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = buckets[buckets.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
      aria-label={`Sparkline (last ${buckets.length} days, max ${max}/day, latest ${last.count})`}
    >
      <polyline
        fill="none"
        stroke="#1a73e8"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

export default async function AnalyticsPage() {
  const now = new Date();
  const [summary, perKind, sparklines, perMailbox] = await Promise.all([
    fetchAnalyticsSummary(now),
    fetchAnalyticsPerKind(now),
    fetchAnalyticsSparklines(now),
    fetchAnalyticsPerMailbox(now),
  ]);

  return (
    <div className="max-w-5xl px-8 py-10">
      <h1 className="text-[20px] font-semibold mb-1">Agent analytics</h1>
      <p className="text-[13px] mb-6" style={{ color: "#888" }}>
        Rolling 30-day window across all agent runs.
      </p>

      {/* Summary cards */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        style={{ fontSize: 13 }}
      >
        <SummaryCard label="Total runs" value={String(summary.totalRuns)} />
        <SummaryCard
          label="Total cost"
          value={formatUsd(summary.totalCostUsd)}
        />
        <SummaryCard
          label="Success rate"
          value={`${summary.successRatePct.toFixed(1)}%`}
        />
        <SummaryCard
          label="Duration p50 / p95"
          value={`${formatMs(summary.p50DurationMs)} · ${formatMs(summary.p95DurationMs)}`}
        />
      </div>

      {/* Per-kind table */}
      <h2 className="text-[14px] font-semibold mb-2">By kind</h2>
      {perKind.length === 0 ? (
        <div
          className="rounded-md border px-4 py-6 text-center text-[13px]"
          style={{ borderColor: "#e0e0e0", color: "#888" }}
        >
          No agent runs in the last 30 days.
        </div>
      ) : (
        <div
          className="rounded-md border overflow-x-auto mb-8"
          style={{ borderColor: "#e0e0e0" }}
        >
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#fafafa", color: "#666" }}>
              <tr>
                <Th>Kind</Th>
                <Th align="right">Runs</Th>
                <Th align="right">Success</Th>
                <Th align="right">Avg cost</Th>
                <Th align="right">Total cost</Th>
                <Th align="right">Avg in</Th>
                <Th align="right">Avg out</Th>
                <Th align="right">p50</Th>
                <Th align="right">p95</Th>
              </tr>
            </thead>
            <tbody>
              {perKind.map((r) => (
                <tr
                  key={r.kind}
                  style={{ borderTop: "1px solid #f0f0f0" }}
                >
                  <Td>{r.kind}</Td>
                  <Td align="right">{r.runs}</Td>
                  <Td align="right">{r.successRatePct.toFixed(1)}%</Td>
                  <Td align="right">{formatUsd(r.avgCostUsd)}</Td>
                  <Td align="right">{formatUsd(r.totalCostUsd)}</Td>
                  <Td align="right">{r.avgInputTokens}</Td>
                  <Td align="right">{r.avgOutputTokens}</Td>
                  <Td align="right">{formatMs(r.p50DurationMs)}</Td>
                  <Td align="right">{formatMs(r.p95DurationMs)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-mailbox cards */}
      <h2 className="text-[14px] font-semibold mb-2">Per mailbox</h2>
      {perMailbox.length === 0 ? (
        <div
          className="rounded-md border px-4 py-6 text-center text-[13px] mb-8"
          style={{ borderColor: "#e0e0e0", color: "#888" }}
        >
          No active mailboxes connected.
        </div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8"
        >
          {perMailbox.map((m) => (
            <MailboxCard key={m.mailboxId} row={m} />
          ))}
        </div>
      )}

      {/* Sparklines */}
      <h2 className="text-[14px] font-semibold mb-2">Runs / day</h2>
      {sparklines.length === 0 ? (
        <div
          className="rounded-md border px-4 py-6 text-center text-[13px]"
          style={{ borderColor: "#e0e0e0", color: "#888" }}
        >
          No data to chart.
        </div>
      ) : (
        <div
          className="rounded-md border"
          style={{ borderColor: "#e0e0e0" }}
        >
          {sparklines.map((sl) => (
            <div
              key={sl.kind}
              className="flex items-center justify-between gap-4 px-4 py-2"
              style={{ borderBottom: "1px solid #f0f0f0" }}
            >
              <div className="text-[12px] font-medium" style={{ minWidth: 120 }}>
                {sl.kind}
              </div>
              <Sparkline buckets={sl.buckets} />
              <div className="text-[11px]" style={{ color: "#888" }}>
                {sl.buckets.reduce((a, b) => a + b.count, 0)} runs
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function mailboxEmailLabel(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function MiniSparkline({
  counts,
  width = 80,
  height = 24,
}: {
  counts: number[];
  width?: number;
  height?: number;
}) {
  if (counts.length === 0) return null;
  const max = Math.max(...counts, 1);
  const stepX = width / Math.max(counts.length - 1, 1);
  const points = counts
    .map((c, i) => {
      const x = i * stepX;
      const y = height - (c / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
      aria-label={`Mini sparkline (last ${counts.length} days, max ${max}/day)`}
    >
      <polyline fill="none" stroke="#1a73e8" strokeWidth="1.5" points={points} />
    </svg>
  );
}

function MailboxCard({ row }: { row: PerMailboxRow }) {
  const successRate = row.runs === 0 ? 0 : (row.succeeded / row.runs) * 100;
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{ borderColor: "#e0e0e0", background: "#ffffff" }}
    >
      <div
        className="truncate text-[13px] font-semibold"
        title={row.email}
        style={{ color: "#1a1a1a" }}
      >
        {mailboxEmailLabel(row.email)}
      </div>
      <div
        className="text-[11px] mb-2 truncate"
        style={{ color: "#888" }}
        title={row.email}
      >
        {row.email}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px]" style={{ color: "#888" }}>
            Runs (30d) · {row.runs}
          </div>
          <div className="text-[11px]" style={{ color: "#888" }}>
            Success · {successRate.toFixed(1)}%
          </div>
          <div className="text-[11px]" style={{ color: "#888" }}>
            Cost · {formatUsd(row.costUsd)}
          </div>
        </div>
        <MiniSparkline counts={row.dailyCounts} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{ borderColor: "#e0e0e0", background: "#ffffff" }}
    >
      <div className="text-[11px] uppercase font-semibold" style={{ color: "#888" }}>
        {label}
      </div>
      <div className="text-[18px] font-semibold mt-1" style={{ color: "#1a1a1a" }}>
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontWeight: 600,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "8px 12px",
        color: "#222",
      }}
    >
      {children}
    </td>
  );
}
