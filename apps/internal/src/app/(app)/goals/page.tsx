import GoalsPage from "./goals-client";
import type { DbGoal } from "./goals-client";
import { getGoals, getInvoices } from "@/lib/queries";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Goals" };

export default async function GoalsServerPage() {
  const [realGoals, realInvoices] = await Promise.all([getGoals(), getInvoices()]);

  const dbGoals: DbGoal[] | undefined = realGoals.length > 0
    ? realGoals.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        unit: g.unit,
        deadline: g.deadline,
        achieved: g.achieved,
      }))
    : undefined;

  const paidTotal = realInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const currentRevenue: number | undefined = paidTotal > 0 ? paidTotal : undefined;

  return (
    <GoalsPage
      dbGoals={dbGoals}
      currentRevenue={currentRevenue}
    />
  );
}
