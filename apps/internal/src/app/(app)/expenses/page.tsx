export const metadata = { title: "Expenses" };

import { getExpenses } from "@/lib/queries";
import { EXPENSE_CATEGORY_COLORS, type ExpenseCategory } from "@/lib/mock-finance";

export const dynamic = 'force-dynamic';

interface ExpenseRow {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  project: string | null;
}

export default async function ExpensesPage() {
  let expenseRows: ExpenseRow[] = [];

  try {
    const rawExpenses = await getExpenses();
    expenseRows = rawExpenses.map((exp) => ({
      id: exp.id,
      date: exp.date,
      description: exp.description,
      category: exp.category,
      amount: Number(exp.amount),
      project: null,
    }));
  } catch {
    // DB unavailable
  }

  const monthlyBurn = expenseRows.reduce((sum, exp) => sum + exp.amount, 0);

  // Find top category
  const categoryTotals: Record<string, number> = {};
  for (const exp of expenseRows) {
    categoryTotals[exp.category] =
      (categoryTotals[exp.category] ?? 0) + exp.amount;
  }
  const sortedCategories = Object.entries(categoryTotals).sort(
    (a, b) => b[1] - a[1]
  );
  const topCategory = sortedCategories[0] ?? null;

  if (expenseRows.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">Expenses</h1>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-8 text-center">
          <p className="text-[15px] font-medium text-[#555]">
            No expenses recorded yet
          </p>
          <p className="mt-1 text-[13px] text-[#888]">
            Expenses will appear here once they are added to the database.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Expenses</h1>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Monthly Burn
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            ${monthlyBurn.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Top Category
          </p>
          <p className="mt-1 text-xl font-semibold text-[#222]">
            {topCategory ? topCategory[0] : "N/A"}
          </p>
          {topCategory && (
            <p className="text-[12px] text-[#888]">
              ${topCategory[1].toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#e0e0e0] bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e0e0e0]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Date
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Description
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Category
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Amount
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Project
              </th>
            </tr>
          </thead>
          <tbody>
            {expenseRows.map((exp) => (
              <tr
                key={exp.id}
                className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
              >
                <td className="px-4 py-3 text-[13px] text-[#555]">
                  {exp.date}
                </td>
                <td className="px-4 py-3 text-[13px] text-[#222]">
                  {exp.description}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${EXPENSE_CATEGORY_COLORS[exp.category as ExpenseCategory] ?? "bg-[#f0f0f0] text-[#888]"}`}
                  >
                    {exp.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-[13px] font-medium text-[#222]">
                  ${exp.amount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-[13px] text-[#555]">
                  {exp.project ?? "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
