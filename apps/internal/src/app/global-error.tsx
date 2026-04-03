"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-[#222]">Something went wrong</h1>
            <p className="mt-2 text-[15px] text-[#888]">
              {error.message || "An unexpected error occurred"}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={reset}
                className="rounded-lg bg-[#111] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#333]"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="rounded-lg border border-[#e0e0e0] px-5 py-2.5 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
