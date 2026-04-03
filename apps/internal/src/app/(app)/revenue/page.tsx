export const metadata = { title: "Revenue" };

import {
  getInvoices,
  getMonthlyRevenue,
  getMRR,
  getPipelineEngagements,
} from "@/lib/queries";

export const dynamic = 'force-dynamic';

interface MonthlyRevenueRow {
  month: string;
  revenue: number;
}

export default async function RevenuePage() {
  let paidInvoices: { client: string; amount: number }[] = [];
  let monthlyRevenue: MonthlyRevenueRow[] = [];
  let mrr = 0;
  let pipelineDeals: {
    name: string;
    client: string;
    value: number;
    probability: number;
    weighted: number;
  }[] = [];

  try {
    const rawInvoices = await getInvoices();
    paidInvoices = rawInvoices
      .filter((inv) => inv.status === "paid")
      .map((inv) => ({
        client: inv.clientName,
        amount: Number(inv.amount),
      }));
  } catch {
    // DB unavailable
  }

  try {
    const rawMonthly = await getMonthlyRevenue();
    const rows = rawMonthly as unknown as { month: string; revenue: string }[];
    if (rows.length > 0) {
      monthlyRevenue = rows.map((r) => ({
        month: new Date(r.month).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        revenue: Number(r.revenue),
      }));
    }
  } catch {
    // DB unavailable
  }

  try {
    mrr = await getMRR();
  } catch {
    // DB unavailable
  }

  try {
    const rawEngagements = await getPipelineEngagements();
    pipelineDeals = rawEngagements
      .filter(
        (eng) =>
          eng.dealValue &&
          eng.probability &&
          !["closed_won", "closed_lost"].includes(eng.stage)
      )
      .map((eng) => ({
        name: eng.name,
        client: eng.companyName,
        value: Number(eng.dealValue),
        probability: Number(eng.probability),
        weighted: Math.round(
          Number(eng.dealValue) * (Number(eng.probability) / 100)
        ),
      }));
  } catch {
    // DB unavailable
  }

  const totalPaid = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  const currentMonth =
    monthlyRevenue.length > 0
      ? monthlyRevenue[monthlyRevenue.length - 1]
      : null;
  const lastThreeMonths = monthlyRevenue.slice(-3);
  const quarterly = lastThreeMonths.reduce((sum, m) => sum + m.revenue, 0);
  const ytd = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);

  const maxRevenue =
    monthlyRevenue.length > 0
      ? Math.max(...monthlyRevenue.map((m) => m.revenue))
      : 0;

  // Revenue by client
  const revenueByClient: Record<string, number> = {};
  for (const inv of paidInvoices) {
    revenueByClient[inv.client] =
      (revenueByClient[inv.client] ?? 0) + inv.amount;
  }
  const clientRevenue = Object.entries(revenueByClient).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Revenue</h1>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Monthly
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            ${currentMonth ? currentMonth.revenue.toLocaleString() : "0"}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Quarterly
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            ${quarterly.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            YTD
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            ${ytd.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            MRR
          </p>
          <p className="mt-1 text-xl font-semibold text-[#27ae60]">
            ${mrr.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Revenue by month chart */}
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#333]">
            Revenue by Month
          </h2>
          {monthlyRevenue.length > 0 ? (
            <div className="flex items-end gap-3" style={{ height: 200 }}>
              {monthlyRevenue.map((m) => {
                const heightPct =
                  maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
                return (
                  <div
                    key={m.month}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-[11px] font-medium text-[#222]">
                      ${(m.revenue / 1000).toFixed(1)}k
                    </span>
                    <div
                      className="w-full rounded-t bg-[#1a73e8]"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[10px] text-[#888]">
                      {m.month.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-[#888]">
              No revenue data yet
            </p>
          )}
        </div>

        {/* Revenue by client */}
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#333]">
            Revenue by Client
          </h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e0e0e0]">
                <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Client
                </th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Revenue
                </th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              {clientRevenue.map(([client, revenue]) => (
                <tr
                  key={client}
                  className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
                >
                  <td className="py-2 text-[13px] text-[#222]">{client}</td>
                  <td className="py-2 text-right text-[13px] font-medium text-[#222]">
                    ${revenue.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-[12px] text-[#888]">
                    {totalPaid > 0
                      ? Math.round((revenue / totalPaid) * 100)
                      : 0}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pipeline forecast */}
        <div className="col-span-2 rounded-lg border border-[#e0e0e0] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#333]">
            Pipeline Forecast (Weighted by Probability)
          </h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e0e0e0]">
                <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Deal
                </th>
                <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Client
                </th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Value
                </th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Probability
                </th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Weighted
                </th>
              </tr>
            </thead>
            <tbody>
              {pipelineDeals.map((deal) => (
                <tr
                  key={deal.name}
                  className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
                >
                  <td className="py-2 text-[13px] text-[#222]">{deal.name}</td>
                  <td className="py-2 text-[13px] text-[#555]">
                    {deal.client}
                  </td>
                  <td className="py-2 text-right text-[13px] text-[#555]">
                    ${deal.value.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-[13px] text-[#555]">
                    {deal.probability}%
                  </td>
                  <td className="py-2 text-right text-[13px] font-medium text-[#222]">
                    ${deal.weighted.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr>
                <td
                  colSpan={4}
                  className="py-2 text-right text-[13px] font-semibold text-[#222]"
                >
                  Total Weighted Pipeline
                </td>
                <td className="py-2 text-right text-[14px] font-semibold text-[#1a73e8]">
                  $
                  {pipelineDeals
                    .reduce((sum, d) => sum + d.weighted, 0)
                    .toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
