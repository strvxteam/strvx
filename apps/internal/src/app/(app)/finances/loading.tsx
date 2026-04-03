import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Revenue chart area */}
      <div className="rounded-lg border p-4">
        <Skeleton className="mb-3 h-6 w-36" />
        <Skeleton className="h-[200px] w-full" />
      </div>

      {/* 2-column grid with tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((tableIndex) => (
          <div key={tableIndex} className="rounded-lg border">
            <div className="border-b p-4">
              <Skeleton className="h-6 w-32" />
            </div>
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="grid grid-cols-3 gap-4 border-b p-4 last:border-b-0"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
