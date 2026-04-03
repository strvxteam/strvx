import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      {/* 4 Kanban columns: todo, in_progress, blocked, done */}
      <div className="grid grid-cols-4 gap-4">
        {[3, 2, 2, 3].map((cardCount, colIndex) => (
          <div key={colIndex} className="space-y-3 rounded-lg border p-3">
            <Skeleton className="h-6 w-28" />
            {Array.from({ length: cardCount }).map((_, cardIndex) => (
              <div key={cardIndex} className="space-y-3 rounded-md border p-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
