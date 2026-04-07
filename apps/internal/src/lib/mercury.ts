// Mercury Bank API Client — read-only
// Docs: https://docs.mercury.com/reference/welcome-to-mercury-api

const MERCURY_BASE = "https://api.mercury.com/api/v1";

function getHeaders(): HeadersInit {
  const apiKey = process.env.MERCURY_API_KEY;
  if (!apiKey) throw new Error("MERCURY_API_KEY is not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// ── Types ─────────────────────────────────────────────

export interface MercuryAccount {
  id: string;
  name: string;
  kind: "checking" | "savings";
  status: string;
  currentBalance: number;
  availableBalance: number;
  accountNumber: string;
  routingNumber: string;
  createdAt: string;
}

export interface MercuryTransaction {
  id: string;
  amount: number;
  bankDescription: string | null;
  counterpartyName: string;
  counterpartyNickname: string | null;
  createdAt: string;
  dashboardLink: string | null;
  details: string | null;
  estimatedDeliveryDate: string | null;
  failedAt: string | null;
  kind: string;
  note: string | null;
  postedAt: string | null;
  reasonForFailure: string | null;
  status: "pending" | "sent" | "cancelled" | "failed";
}

interface PaginatedResponse<T> {
  total: number;
  transactions?: T[];
  accounts?: T[];
}

// ── API Functions ─────────────────────────────────────

export async function getMercuryAccounts(): Promise<MercuryAccount[]> {
  const res = await fetch(`${MERCURY_BASE}/accounts`, {
    headers: getHeaders(),
    next: { revalidate: 300 }, // cache for 5 min
  });
  if (!res.ok) {
    console.error("[Mercury] Failed to fetch accounts:", res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as PaginatedResponse<MercuryAccount>;
  return data.accounts ?? [];
}

export async function getMercuryTransactions(
  accountId: string,
  options?: { limit?: number; offset?: number; start?: string; end?: string; status?: string }
): Promise<{ total: number; transactions: MercuryTransaction[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.start) params.set("start", options.start);
  if (options?.end) params.set("end", options.end);
  if (options?.status) params.set("status", options.status);

  const url = `${MERCURY_BASE}/account/${accountId}/transactions?${params}`;
  const res = await fetch(url, {
    headers: getHeaders(),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    console.error("[Mercury] Failed to fetch transactions:", res.status, await res.text());
    return { total: 0, transactions: [] };
  }
  const data = (await res.json()) as PaginatedResponse<MercuryTransaction> & { transactions: MercuryTransaction[] };
  return { total: data.total ?? 0, transactions: data.transactions ?? [] };
}

export async function getAllMercuryTransactions(
  options?: { limit?: number; start?: string; end?: string; status?: string }
): Promise<MercuryTransaction[]> {
  const accounts = await getMercuryAccounts();
  if (accounts.length === 0) return [];

  const allTxns: MercuryTransaction[] = [];
  await Promise.all(
    accounts.map(async (acct) => {
      const { transactions } = await getMercuryTransactions(acct.id, options);
      allTxns.push(...transactions);
    })
  );

  // Sort by date descending
  allTxns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return allTxns;
}

// ── Helpers ───────────────────────────────────────────

export function isMercuryConfigured(): boolean {
  return !!process.env.MERCURY_API_KEY;
}
