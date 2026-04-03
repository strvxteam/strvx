"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fde8e8]">
            <AlertTriangle size={24} className="text-[#c0392b]" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-[#222]">Something went wrong</h2>
        <p className="mt-1 max-w-md text-[13px] text-[#888]">
          {error.message &&
          !error.message.includes("select ") &&
          !error.message.includes("insert ") &&
          !error.message.includes("update ") &&
          !error.message.includes("delete ") &&
          error.message.length < 200
            ? error.message
            : "An unexpected error occurred while loading this page."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-[#111] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#333]"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
