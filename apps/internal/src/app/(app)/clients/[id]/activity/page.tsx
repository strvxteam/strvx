import { getEngagementTimeline } from "@/lib/queries";

export default async function ActivityTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entries = await getEngagementTimeline(id);
  if (entries.length === 0) {
    return <p className="text-[13px] text-[#888]">No activity yet.</p>;
  }
  return (
    <div className="divide-y divide-[#f0f0f0] rounded-md border border-[#e0e0e0] bg-white">
      {entries.map((e) => (
        <div key={e.id} className="px-4 py-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[#555]">
              {e.type}
            </span>
            <span className="text-[11px] text-[#999]">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[#333]">{e.content}</p>
          <p className="mt-1 text-[11px] text-[#888]">— {e.authorName}</p>
        </div>
      ))}
    </div>
  );
}
