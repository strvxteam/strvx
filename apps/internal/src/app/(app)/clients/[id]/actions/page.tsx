import { getEngagementActions } from "@/lib/queries";

export default async function ActionsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actions = await getEngagementActions(id);
  if (actions.length === 0) {
    return <p className="text-[13px] text-[#888]">No next actions yet.</p>;
  }
  return (
    <div className="divide-y divide-[#f0f0f0] rounded-md border border-[#e0e0e0] bg-white">
      {actions.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
          <span
            className={`h-3 w-3 shrink-0 rounded-full ${
              a.completed ? "bg-[#27ae60]" : "bg-[#e67e22]"
            }`}
          />
          <div className="flex-1">
            <p className={a.completed ? "text-[#888] line-through" : "text-[#222]"}>
              {a.description}
            </p>
            <p className="text-[11px] text-[#888]">
              {a.ownerName}
              {a.dueDate ? ` · due ${a.dueDate}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
