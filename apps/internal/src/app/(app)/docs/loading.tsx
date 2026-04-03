import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-[240px] rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="space-y-0">
        <div className="flex border-b py-2.5">
          <Skeleton className="h-4 w-16 ml-2" />
          <Skeleton className="h-4 w-16 ml-auto mr-32" />
          <Skeleton className="h-4 w-20 mr-2" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center border-b py-3 px-2">
            <Skeleton className="h-4 w-48" />
            <div className="ml-auto mr-24 flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
