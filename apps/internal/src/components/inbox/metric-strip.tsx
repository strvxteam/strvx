export function MetricStrip({
  revenue,
  mrr,
  activeDeals,
  outstanding,
}: {
  revenue: number;
  mrr: number;
  activeDeals: number;
  outstanding: number;
}) {
  return (
    <div className="mb-5 grid grid-cols-4 gap-3">
      <Metric label="Revenue" value={`$${revenue.toLocaleString()}`} tint="green" />
      <Metric label="MRR" value={`$${mrr.toLocaleString()}`} tint="blue" />
      <Metric label="Active deals" value={String(activeDeals)} />
      <Metric
        label="Outstanding"
        value={`$${outstanding.toLocaleString()}`}
        tint={outstanding > 0 ? "amber" : undefined}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: "green" | "blue" | "amber";
}) {
  const color =
    tint === "green"
      ? "text-[#27ae60]"
      : tint === "blue"
        ? "text-[#1a73e8]"
        : tint === "amber"
          ? "text-[#e67e22]"
          : "text-[#222]";
  return (
    <div className="rounded-md border border-[#e8e8e8] bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-[#999]">{label}</p>
      <p className={`mt-1 text-[16px] font-bold ${color}`}>{value}</p>
    </div>
  );
}
