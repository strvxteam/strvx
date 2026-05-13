export default function Loading() {
  return (
    <div
      className="flex h-full w-full"
      style={{ background: "#f8f8f8" }}
    >
      <aside
        className="shrink-0 border-r"
        style={{ width: 320, borderColor: "#e0e0e0", background: "#ffffff" }}
      >
        <div className="space-y-2 p-4">
          <div
            className="h-8 animate-pulse rounded-md"
            style={{ background: "#f0f0f0" }}
          />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md"
              style={{ background: "#f0f0f0" }}
            />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-8">
        <div
          className="mb-4 h-6 w-2/3 animate-pulse rounded-md"
          style={{ background: "#f0f0f0" }}
        />
        <div
          className="mb-8 h-4 w-1/2 animate-pulse rounded-md"
          style={{ background: "#f0f0f0" }}
        />
        <div
          className="h-64 animate-pulse rounded-md"
          style={{ background: "#f0f0f0" }}
        />
      </main>
    </div>
  );
}
