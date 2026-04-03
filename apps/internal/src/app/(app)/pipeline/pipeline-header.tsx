"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateEngagementForm } from "@/components/create-engagement-form";

export function PipelineHeader() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-xl font-semibold">Pipeline</h1>
      <button
        onClick={() => setShowCreate(true)}
        className="flex items-center gap-1.5 rounded-lg bg-[#111] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#333]"
      >
        <Plus size={14} strokeWidth={2} />
        New Engagement
      </button>
      {showCreate && (
        <CreateEngagementForm onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
