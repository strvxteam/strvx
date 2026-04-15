export default function PartnerPipelineLoading() {
  const cardCounts = [3, 1, 2, 1, 1];

  return (
    <div>
      <div className="mb-6">
        <div className="h-7 w-40 animate-pulse rounded bg-[#e0e0e0]" />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            {cardCounts.map((count, i) => (
              <div
                key={i}
                className="flex min-h-[420px] flex-col rounded-lg border border-[#e0e0e0] bg-white"
              >
                <div className="flex items-center justify-between border-b border-[#f0f0f0] px-3 py-2.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-[#e0e0e0]" />
                  <div className="h-5 w-5 animate-pulse rounded-full bg-[#e0e0e0]" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {Array.from({ length: count }).map((_, j) => (
                    <div
                      key={j}
                      className="h-20 animate-pulse rounded-md bg-[#e8e8e8]"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
