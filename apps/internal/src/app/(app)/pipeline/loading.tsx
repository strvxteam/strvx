import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Skeleton className="h-8 w-48" />

      {/* 6 Kanban columns */}
      <div className="grid grid-cols-6 gap-4">
        {[3, 2, 3, 2, 3, 2].map((cardCount, colIndex) => (
          <div key={colIndex} className="space-y-3 rounded-lg border p-3">
            <Skeleton className="h-6 w-24" />
            {Array.from({ length: cardCount }).map((_, cardIndex) => (
              <div key={cardIndex} className="space-y-3 rounded-md border p-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
