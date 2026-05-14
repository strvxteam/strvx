import Link from "next/link";
import type { FollowUpWatcherRow } from "../_queries";
import { WatcherCancelButton } from "./row-actions";

const KIND_LABEL: Record<FollowUpWatcherRow["kind"], string> = {
  stale_thread: "Stale thread",
  stale_pipeline: "Stale pipeline",
  no_show: "No-show",
  post_meeting_followup: "Post-meeting",
};

const STATUS_COLOR: Record<FollowUpWatcherRow["status"], string> = {
  pending: "#f39c12",
  fired: "#1a73e8",
  cancelled: "#888",
  suppressed: "#aaa",
};

export function WatcherRow({ row }: { row: FollowUpWatcherRow }) {
  const dotColor = STATUS_COLOR[row.status];

  const title = row.threadSubject ?? row.engagementName ?? "(no title)";
  const sublabel = [
    KIND_LABEL[row.kind],
    row.engagementName && row.threadSubject ? row.engagementName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td className="py-2 pr-3 max-w-md">
        <div className="font-medium truncate">{title}</div>
        <div className="text-[12px] truncate" style={{ color: "#888" }}>
          {sublabel}
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: dotColor }}
          />
          <span className="text-[12px]" style={{ color: "#666" }}>
            {row.status}
          </span>
        </div>
      </td>
      <td className="py-2 pr-3 text-[12px]" style={{ color: "#666" }}>
        {KIND_LABEL[row.kind]}
      </td>
      <td className="py-2 pr-3 text-[12px]" style={{ color: "#888" }}>
        {formatTime(row.triggerAfter)}
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {row.threadId && (
            <Link
              href={`/agent-inbox?thread=${row.threadId}`}
              className="text-[12px]"
              style={{ color: "#1a73e8" }}
            >
              Open thread →
            </Link>
          )}
          {row.status === "pending" && (
            <WatcherCancelButton watcherId={row.id} />
          )}
        </div>
      </td>
    </tr>
  );
}

function formatTime(d: Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60000);
  const verb = diff < 0 ? "ago" : "from now";
  if (m < 60) return `${m}m ${verb}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${verb}`;
  const days = Math.floor(h / 24);
  return `${days}d ${verb}`;
}
