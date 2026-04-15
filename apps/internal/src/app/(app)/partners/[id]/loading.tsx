export default function PartnerDetailLoading() {
  return (
    <div className="flex gap-6 pb-24 animate-pulse">
      {/* Left column */}
      <div className="flex flex-col gap-4" style={{ flex: "1.2" }}>
        {/* Header card skeleton */}
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 rounded bg-muted" />
              <div className="flex gap-1.5">
                <div className="h-5 w-20 rounded-full bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
            </div>
            <div className="h-7 w-24 rounded-lg bg-muted" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between py-1">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>

        {/* Financial summary skeleton */}
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 h-3 w-32 rounded bg-muted" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-muted p-3">
                <div className="mb-1 h-3 w-16 rounded bg-muted/70" />
                <div className="h-5 w-20 rounded bg-muted/70" />
              </div>
            ))}
          </div>
        </div>

        {/* Linked Engagements skeleton */}
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 h-3 w-40 rounded bg-muted" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <div className="space-y-1">
                  <div className="h-4 w-36 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="h-5 w-20 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>

        {/* Linked Projects skeleton */}
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 h-3 w-32 rounded bg-muted" />
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4" style={{ flex: "0.8" }}>
        {/* Contacts skeleton */}
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 h-3 w-20 rounded bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-muted" />
                <div className="space-y-1">
                  <div className="h-4 w-28 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline skeleton */}
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 h-3 w-32 rounded bg-muted" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex gap-2">
                    <div className="h-3 w-20 rounded bg-muted" />
                    <div className="h-3 w-12 rounded bg-muted" />
                  </div>
                  <div className="h-4 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
