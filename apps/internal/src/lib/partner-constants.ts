export const PARTNER_KANBAN_STAGES = [
  "prospective",
  "onboarding",
  "active",
  "on_hold",
  "churned",
] as const;

export type PartnerStage = (typeof PARTNER_KANBAN_STAGES)[number];

export const PARTNER_STAGE_LABELS: Record<string, string> = {
  prospective: "Prospective",
  onboarding: "Onboarding",
  active: "Active",
  on_hold: "On Hold",
  churned: "Churned",
};

export const PARTNER_STAGE_COLORS: Record<string, string> = {
  prospective: "bg-[#e8f0fe] text-[#1a73e8]",
  onboarding: "bg-[#fef3e2] text-[#f39c12]",
  active: "bg-[#e8f5e9] text-[#27ae60]",
  on_hold: "bg-[#f1f5f9] text-[#64748b]",
  churned: "bg-[#fde8e8] text-[#e74c3c]",
};

export const PARTNER_STAGE_DOT_COLORS: Record<string, string> = {
  prospective: "#1a73e8",
  onboarding: "#f39c12",
  active: "#27ae60",
  on_hold: "#64748b",
  churned: "#e74c3c",
};

export const PARTNER_COLUMN_BG: Record<string, string> = {
  prospective: "bg-[#f8f8f8]",
  onboarding: "bg-[#f8f8f8]",
  active: "bg-[#f0faf0]",
  on_hold: "bg-[#f8f8f8]",
  churned: "bg-[#fdf0f0]",
};

export const PARTNER_LINK_ROLE_LABELS: Record<string, string> = {
  referrer: "Referrer",
  subcontractor: "Subcontractor",
  co_builder: "Co-Builder",
  consultant: "Consultant",
  vendor: "Vendor",
};

export const PARTNER_TAG_COLORS: Record<string, { bg: string; text: string }> = {
  referral: { bg: "bg-[#fef3e2]", text: "text-[#f39c12]" },
  service: { bg: "bg-[#e8f5e9]", text: "text-[#27ae60]" },
  strategic: { bg: "bg-[#e8f0fe]", text: "text-[#1a73e8]" },
};

export interface PartnerPipelineItem {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  stageEnteredAt: Date | string;
  tags: string[] | null;
  commissionRate: string | null;
  hourlyRate: string | null;
  linkedEngagementCount: number;
  linkedProjectCount: number;
}
