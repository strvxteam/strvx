"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { PaletteInlineForm } from "@/components/palette/palette-form";
import { logInteractionInline, addNextActionInline, createTaskInline } from "@/app/actions/palette";
import { toast } from "sonner";

type Action =
  | { id: "log-interaction"; engagementId: string }
  | { id: "add-next-action"; engagementId: string }
  | { id: "new-task"; engagementId: string };

export function EntityHeader({
  title, subtitle, engagementId,
}: {
  title: string;
  subtitle?: string;
  engagementId: string;
}) {
  const [active, setActive] = useState<Action | null>(null);

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#111]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-[#888]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActive({ id: "log-interaction", engagementId })}
            className="rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white"
          >
            Log interaction
          </button>
          <OverflowMenu
            onAddNextAction={() => setActive({ id: "add-next-action", engagementId })}
            onAddTask={() => setActive({ id: "new-task", engagementId })}
          />
        </div>
      </header>
      {active && <FormOverlay action={active} onClose={() => setActive(null)} />}
    </>
  );
}

function OverflowMenu({ onAddNextAction, onAddTask }: { onAddNextAction: () => void; onAddTask: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label="More actions"
        className="rounded-md border border-[#e0e0e0] bg-white p-1.5 text-[#555]">
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-[#e0e0e0] bg-white py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}>
          <button onClick={() => { onAddNextAction(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f5f5f5]">Add next action</button>
          <button onClick={() => { onAddTask(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f5f5f5]">Add task</button>
        </div>
      )}
    </div>
  );
}

function FormOverlay({ action, onClose }: { action: Action; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]" onClick={onClose} role="presentation">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-[#e0e0e0] bg-white"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Inline form">
        {action.id === "log-interaction" && (
          <PaletteInlineForm
            title="Log interaction"
            fields={[
              { key: "type", label: "Type", type: "select", required: true, options: [
                { value: "note", label: "Note" }, { value: "meeting", label: "Meeting" },
              ]},
              { key: "content", label: "Content", type: "textarea", required: true, rows: 3 },
            ]}
            onCancel={onClose}
            onSubmit={async (v) => {
              const res = await logInteractionInline({
                engagementId: action.engagementId,
                type: v.type as "note" | "meeting",
                content: v.content,
              });
              return res.success ? { success: true } : { success: false, error: res.error };
            }}
            onSuccess={() => { toast.success("Interaction logged"); onClose(); }}
          />
        )}
        {action.id === "add-next-action" && (
          <PaletteInlineForm
            title="Add next action"
            fields={[
              { key: "description", label: "Description", type: "text", required: true },
              { key: "dueDate", label: "Due", type: "date" },
            ]}
            onCancel={onClose}
            onSubmit={async (v) => {
              const res = await addNextActionInline({
                engagementId: action.engagementId,
                description: v.description,
                dueDate: v.dueDate || undefined,
              });
              return res.success ? { success: true } : { success: false, error: res.error };
            }}
            onSuccess={() => { toast.success("Next action added"); onClose(); }}
          />
        )}
        {action.id === "new-task" && (
          <PaletteInlineForm
            title="New task"
            fields={[
              { key: "title", label: "Title", type: "text", required: true },
              { key: "dueDate", label: "Due", type: "date" },
            ]}
            onCancel={onClose}
            onSubmit={async (v) => {
              const res = await createTaskInline({
                title: v.title,
                dueDate: v.dueDate || undefined,
                engagementId: action.engagementId,
              });
              return res.success ? { success: true } : { success: false, error: res.error };
            }}
            onSuccess={() => { toast.success("Task created"); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
