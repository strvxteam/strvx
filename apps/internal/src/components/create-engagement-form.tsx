"use client";

import { useState, useTransition } from "react";
import { createEngagement } from "@/app/actions";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

export function CreateEngagementForm({
  onClose,
}: {
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const engagement = await createEngagement(formData);
        toast.success("Engagement created");
        router.push(`/clients/${engagement.id}`);
        router.refresh();
        onClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create";
        toast.error(message);
        setError(message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md rounded-lg border border-[#e0e0e0] bg-white p-5 sm:p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">New Engagement</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#888] hover:bg-[#f0f0f0]"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Company Name *
            </label>
            <input
              name="companyName"
              required
              className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
              placeholder="e.g. The Stability Group"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Engagement Name *
            </label>
            <input
              name="engagementName"
              required
              className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
              placeholder="e.g. AI Dashboard Project"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Primary Contact
            </label>
            <input
              name="contactName"
              className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
              placeholder="e.g. Jesse Martinez"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Contact Email
              </label>
              <input
                name="contactEmail"
                type="email"
                className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
                placeholder="jesse@stabgroup.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Contact Phone
              </label>
              <input
                name="contactPhone"
                type="tel"
                className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Deal Value
            </label>
            <input
              name="dealValue"
              type="number"
              step="0.01"
              className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-sm outline-none focus:border-[#1a73e8]"
              placeholder="12000"
            />
          </div>

          {error && (
            <div className="rounded-md bg-[#fde8e8] p-2 text-[12px] text-[#c0392b]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="mt-1 rounded-md bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1557b0] disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create Engagement"}
          </button>
        </form>
      </div>
    </div>
  );
}
