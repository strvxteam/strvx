import { getTasks } from "@/lib/queries";

export default async function TasksTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const allTasks = await getTasks();
  const tasks = allTasks.filter((t) => t.engagementId === id);
  if (tasks.length === 0) {
    return <p className="text-[13px] text-[#888]">No tasks yet.</p>;
  }
  return (
    <div className="divide-y divide-[#f0f0f0] rounded-md border border-[#e0e0e0] bg-white">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
          <span
            className={`h-2 w-2 rounded-full ${
              t.status === "done"
                ? "bg-[#27ae60]"
                : t.status === "in_progress"
                  ? "bg-[#1a73e8]"
                  : "bg-[#ccc]"
            }`}
          />
          <div className="flex-1">
            <p className="text-[#222]">{t.title}</p>
            <p className="text-[11px] text-[#888]">
              {t.status}
              {t.dueDate ? ` · due ${t.dueDate}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
