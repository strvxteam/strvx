import { getEngagementTimeline } from "@/lib/queries";

export default async function NotesTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entries = await getEngagementTimeline(id);
  const notes = entries.filter((e) => e.type === "note");
  if (notes.length === 0) {
    return <p className="text-[13px] text-[#888]">No notes yet.</p>;
  }
  return (
    <div className="divide-y divide-[#f0f0f0] rounded-md border border-[#e0e0e0] bg-white">
      {notes.map((n) => (
        <div key={n.id} className="px-4 py-3 text-[13px]">
          <p className="whitespace-pre-wrap text-[#333]">{n.content}</p>
          <p className="mt-1 text-[11px] text-[#888]">
            {n.authorName} · {new Date(n.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
