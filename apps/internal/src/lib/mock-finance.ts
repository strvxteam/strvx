const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  client: string;
  status: InvoiceStatus;
  amount: number;
  date: string;
  dueDate: string;
  paidDate: string | null;
  lineItems: LineItem[];
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-[#f0f0f0] text-[#555]",
  sent: "bg-[#e8f0fe] text-[#1a73e8]",
  paid: "bg-[#e8f5e9] text-[#27ae60]",
  overdue: "bg-[#fde8e8] text-[#c0392b]",
  cancelled: "bg-[#f0f0f0] text-[#888]",
};

export const mockInvoices: Invoice[] = [
  {
    id: "inv-1",
    number: "INV-2026-001",
    client: "The Stability Group",
    status: "paid",
    amount: 4000,
    date: daysAgo(45).toISOString().split("T")[0],
    dueDate: daysAgo(15).toISOString().split("T")[0],
    paidDate: daysAgo(18).toISOString().split("T")[0],
    lineItems: [
      { id: "li-1", description: "MVP v1 Development - Sprint 1", quantity: 40, rate: 75, amount: 3000 },
      { id: "li-2", description: "Design & Prototyping", quantity: 10, rate: 75, amount: 750 },
      { id: "li-3", description: "Project Management", quantity: 5, rate: 50, amount: 250 },
    ],
  },
  {
    id: "inv-2",
    number: "INV-2026-002",
    client: "The Stability Group",
    status: "paid",
    amount: 4000,
    date: daysAgo(30).toISOString().split("T")[0],
    dueDate: daysAgo(0).toISOString().split("T")[0],
    paidDate: daysAgo(3).toISOString().split("T")[0],
    lineItems: [
      { id: "li-4", description: "MVP v2 Development - Sprint 2", quantity: 45, rate: 75, amount: 3375 },
      { id: "li-5", description: "QA & Bug Fixes", quantity: 5, rate: 75, amount: 375 },
      { id: "li-6", description: "Project Management", quantity: 5, rate: 50, amount: 250 },
    ],
  },
  {
    id: "inv-3",
    number: "INV-2026-003",
    client: "The Stability Group",
    status: "sent",
    amount: 4000,
    date: daysAgo(5).toISOString().split("T")[0],
    dueDate: daysFromNow(25).toISOString().split("T")[0],
    paidDate: null,
    lineItems: [
      { id: "li-7", description: "Sprint 3 Development", quantity: 40, rate: 75, amount: 3000 },
      { id: "li-8", description: "Responsive Redesign", quantity: 10, rate: 75, amount: 750 },
      { id: "li-9", description: "Project Management", quantity: 5, rate: 50, amount: 250 },
    ],
  },
  {
    id: "inv-4",
    number: "INV-2026-004",
    client: "Summit Retail",
    status: "paid",
    amount: 12500,
    date: daysAgo(60).toISOString().split("T")[0],
    dueDate: daysAgo(30).toISOString().split("T")[0],
    paidDate: daysAgo(32).toISOString().split("T")[0],
    lineItems: [
      { id: "li-10", description: "E-Commerce Platform - Phase 1", quantity: 120, rate: 85, amount: 10200 },
      { id: "li-11", description: "Design System & UI Kit", quantity: 20, rate: 85, amount: 1700 },
      { id: "li-12", description: "Project Management", quantity: 12, rate: 50, amount: 600 },
    ],
  },
  {
    id: "inv-5",
    number: "INV-2026-005",
    client: "Summit Retail",
    status: "overdue",
    amount: 8750,
    date: daysAgo(35).toISOString().split("T")[0],
    dueDate: daysAgo(5).toISOString().split("T")[0],
    paidDate: null,
    lineItems: [
      { id: "li-13", description: "E-Commerce Platform - Phase 2", quantity: 80, rate: 85, amount: 6800 },
      { id: "li-14", description: "Stripe Integration", quantity: 15, rate: 85, amount: 1275 },
      { id: "li-15", description: "QA & Testing", quantity: 10, rate: 67.5, amount: 675 },
    ],
  },
  {
    id: "inv-6",
    number: "INV-2026-006",
    client: "Dr. Bob Nelson",
    status: "draft",
    amount: 2500,
    date: daysAgo(1).toISOString().split("T")[0],
    dueDate: daysFromNow(29).toISOString().split("T")[0],
    paidDate: null,
    lineItems: [
      { id: "li-16", description: "Website Design - Discovery & Wireframes", quantity: 20, rate: 85, amount: 1700 },
      { id: "li-17", description: "Brand Identity", quantity: 10, rate: 80, amount: 800 },
    ],
  },
  {
    id: "inv-7",
    number: "INV-2026-007",
    client: "Apex Financial",
    status: "overdue",
    amount: 6000,
    date: daysAgo(50).toISOString().split("T")[0],
    dueDate: daysAgo(20).toISOString().split("T")[0],
    paidDate: null,
    lineItems: [
      { id: "li-18", description: "Client Portal - Phase 1 Development", quantity: 60, rate: 85, amount: 5100 },
      { id: "li-19", description: "Auth System & Security Audit", quantity: 10, rate: 90, amount: 900 },
    ],
  },
  {
    id: "inv-8",
    number: "INV-2026-008",
    client: "Summit Retail",
    status: "sent",
    amount: 1200,
    date: daysAgo(2).toISOString().split("T")[0],
    dueDate: daysFromNow(28).toISOString().split("T")[0],
    paidDate: null,
    lineItems: [
      { id: "li-20", description: "Monthly Maintenance - March 2026", quantity: 1, rate: 1200, amount: 1200 },
    ],
  },
];

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export const mockMonthlyRevenue: MonthlyRevenue[] = [
  { month: "Oct 2025", revenue: 14200 },
  { month: "Nov 2025", revenue: 18500 },
  { month: "Dec 2025", revenue: 11800 },
  { month: "Jan 2026", revenue: 22400 },
  { month: "Feb 2026", revenue: 19600 },
  { month: "Mar 2026", revenue: 16700 },
];

export type ExpenseCategory = "Software" | "Hosting" | "Marketing" | "Office" | "Travel" | "Contractors" | "Misc";

export interface Expense {
  id: string;
  date: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  project: string | null;
}

export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Software: "bg-[#e8f0fe] text-[#1a73e8]",
  Hosting: "bg-[#f3e5f5] text-[#8e24aa]",
  Marketing: "bg-[#fff3e0] text-[#e65100]",
  Office: "bg-[#f0f0f0] text-[#555]",
  Travel: "bg-[#e0f2f1] text-[#00897b]",
  Contractors: "bg-[#fef3e2] text-[#e67e22]",
  Misc: "bg-[#f0f0f0] text-[#888]",
};

export const mockExpenses: Expense[] = [
  { id: "exp-1", date: daysAgo(1).toISOString().split("T")[0], description: "Vercel Pro Plan", category: "Hosting", amount: 20, project: null },
  { id: "exp-2", date: daysAgo(1).toISOString().split("T")[0], description: "OpenAI API Credits", category: "Software", amount: 120, project: "AI Workflow Dashboard" },
  { id: "exp-3", date: daysAgo(2).toISOString().split("T")[0], description: "Figma Team Plan", category: "Software", amount: 45, project: null },
  { id: "exp-4", date: daysAgo(3).toISOString().split("T")[0], description: "Google Workspace", category: "Software", amount: 18, project: null },
  { id: "exp-5", date: daysAgo(4).toISOString().split("T")[0], description: "Supabase Pro", category: "Hosting", amount: 25, project: null },
  { id: "exp-6", date: daysAgo(5).toISOString().split("T")[0], description: "LinkedIn Sales Navigator", category: "Marketing", amount: 99, project: null },
  { id: "exp-7", date: daysAgo(6).toISOString().split("T")[0], description: "Claude Pro Subscription", category: "Software", amount: 20, project: null },
  { id: "exp-8", date: daysAgo(7).toISOString().split("T")[0], description: "Cursor Pro", category: "Software", amount: 20, project: null },
  { id: "exp-9", date: daysAgo(8).toISOString().split("T")[0], description: "Stripe Processing Fees", category: "Software", amount: 87, project: "Summit E-Commerce Platform" },
  { id: "exp-10", date: daysAgo(10).toISOString().split("T")[0], description: "Domain Renewals (3)", category: "Hosting", amount: 42, project: null },
  { id: "exp-11", date: daysAgo(12).toISOString().split("T")[0], description: "Coffee Meeting - Client", category: "Travel", amount: 28, project: null },
  { id: "exp-12", date: daysAgo(14).toISOString().split("T")[0], description: "Calendly Premium", category: "Software", amount: 12, project: null },
  { id: "exp-13", date: daysAgo(16).toISOString().split("T")[0], description: "Slack Pro", category: "Software", amount: 25, project: null },
  { id: "exp-14", date: daysAgo(20).toISOString().split("T")[0], description: "Linear Team Plan", category: "Software", amount: 24, project: null },
  { id: "exp-15", date: daysAgo(25).toISOString().split("T")[0], description: "n8n Cloud", category: "Software", amount: 20, project: null },
];

export type ReconciliationStatus = "matched" | "unmatched" | "partial" | "manual" | null;

export const RECONCILIATION_LABELS: Record<string, { text: string; color: string }> = {
  matched: { text: "\u2713 matched", color: "text-[#27ae60]" },
  unmatched: { text: "\u231B pending", color: "text-[#f39c12]" },
  partial: { text: "~ partial", color: "text-[#1a73e8]" },
  manual: { text: "\u2713 manual", color: "text-[#27ae60]" },
};
