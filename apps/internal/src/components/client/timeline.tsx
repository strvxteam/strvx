const TYPE_STYLES: Record<string, string> = {
  meeting: "bg-[#1a73e8]",
  note: "bg-[#27ae60]",
  action: "bg-[#e67e22]",
  stage_change: "bg-[#888]",
};

type TimelineEntry = {
  id: string;
  type: string;
  content: string;
  scheduledAt: Date | null;
  createdAt: Date;
  authorName: string;
};

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
        <p className="py-8 text-center text-sm text-[#aaa]">
          No interactions yet. Use the quick-add bar below to log your first
          note.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#e0e0e0] bg-white">
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          className={`flex gap-3 px-4 py-3 ${
            i < entries.length - 1 ? "border-b border-[#f5f5f5]" : ""
          } ${entry.type === "stage_change" ? "bg-[#fafafa]" : ""}`}
        >
          <div
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
              TYPE_STYLES[entry.type] || "bg-[#ccc]"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-[#aaa]">
              <span>
                {new Date(entry.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {entry.scheduledAt && (
                <span className="text-[#1a73e8]">
                  Scheduled:{" "}
                  {new Date(entry.scheduledAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[13px] text-[#444]">
              <span className="font-medium text-[#222]">
                {entry.authorName}
              </span>{" "}
              · <span className="capitalize text-[#888]">{entry.type.replace("_", " ")}</span>
            </div>
            <p className="mt-1 text-[13px] text-[#333]">{entry.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
