interface Transaction {
  id: string;
  amount: number;
  counterpartyName: string;
  createdAt: string;
}

export interface RecurringCharge {
  counterpartyName: string;
  averageAmount: number;
  frequency: "weekly" | "monthly" | "quarterly";
  confidence: "high" | "medium";
  lastChargedDate: string;
  nextExpectedDate: string;
  occurrences: number;
  totalMonthlyEstimate: number;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function detectFrequency(
  avgGap: number
): "weekly" | "monthly" | "quarterly" | null {
  if (avgGap >= 5 && avgGap <= 10) return "weekly";
  if (avgGap >= 25 && avgGap <= 38) return "monthly";
  if (avgGap >= 80 && avgGap <= 100) return "quarterly";
  return null;
}

function addFrequency(date: Date, freq: "weekly" | "monthly" | "quarterly"): string {
  const d = new Date(date);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setMonth(d.getMonth() + 3);
  return d.toISOString().split("T")[0];
}

function toMonthly(amount: number, freq: "weekly" | "monthly" | "quarterly"): number {
  if (freq === "weekly") return amount * 4.33;
  if (freq === "monthly") return amount;
  return amount / 3;
}

export function detectRecurringCharges(
  transactions: Transaction[]
): RecurringCharge[] {
  // Group by counterparty
  const groups = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    const key = txn.counterpartyName.toLowerCase().trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(txn);
    groups.set(key, list);
  }

  const results: RecurringCharge[] = [];

  for (const [, txns] of groups) {
    if (txns.length < 2) continue;

    // Sort by date ascending
    const sorted = [...txns].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Check amount similarity (within 10% of average)
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const allSimilar = amounts.every(
      (a) => Math.abs(a - avgAmount) / avgAmount <= 0.1
    );
    if (!allSimilar) continue;

    // Check interval regularity
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i].createdAt, sorted[i - 1].createdAt));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

    const frequency = detectFrequency(avgGap);
    if (!frequency) continue;

    // Confidence: exact amount + consistent gap = high
    const exactAmount = amounts.every((a) => a === amounts[0]);
    const gapVariance =
      gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
    const confidence: "high" | "medium" =
      exactAmount && gapVariance < 25 ? "high" : "medium";

    const lastTxn = sorted[sorted.length - 1];

    results.push({
      counterpartyName: lastTxn.counterpartyName,
      averageAmount: Math.round(avgAmount * 100) / 100,
      frequency,
      confidence,
      lastChargedDate: lastTxn.createdAt.split("T")[0],
      nextExpectedDate: addFrequency(new Date(lastTxn.createdAt), frequency),
      occurrences: sorted.length,
      totalMonthlyEstimate: Math.round(toMonthly(avgAmount, frequency) * 100) / 100,
    });
  }

  // Sort by monthly estimate descending
  results.sort((a, b) => b.totalMonthlyEstimate - a.totalMonthlyEstimate);
  return results;
}
