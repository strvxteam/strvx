"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateEngagementForm } from "@/components/create-engagement-form";

export function PipelineClient() {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 rounded-md border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
      >
        <Plus size={14} strokeWidth={1.5} />
        New engagement
      </button>
      {showForm && <CreateEngagementForm onClose={() => setShowForm(false)} />}
    </>
  );
}
