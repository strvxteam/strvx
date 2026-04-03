"use client";

import { useState } from "react";
import { CreateEngagementForm } from "@/components/create-engagement-form";

export function DashboardClient() {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <div className="flex items-center justify-center py-12 text-sm text-[#aaa]">
        <div className="text-center">
          <p className="mb-2 font-medium text-[#555]">All clear</p>
          <p>
            No overdue actions or upcoming meetings.{" "}
            <button
              onClick={() => setShowForm(true)}
              className="text-[#1a73e8] hover:underline"
            >
              Add your first client
            </button>{" "}
            to get started.
          </p>
        </div>
      </div>
      {showForm && <CreateEngagementForm onClose={() => setShowForm(false)} />}
    </>
  );
}
