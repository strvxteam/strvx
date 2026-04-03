export const KANBAN_STAGES = [
  "discovery",
  "building_mvp",
  "proposal",
  "build",
  "deliver",
  "maintain",
] as const;

export type PipelineStage = (typeof KANBAN_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  contacted: "Contacted",
  discovery: "Discovery",
  building_mvp: "Building MVP",
  proposal: "Proposal",
  negotiation: "Negotiation",
  build: "Build",
  deliver: "Deliver",
  maintain: "Maintain",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export const STAGE_COLORS: Record<string, string> = {
  lead: "bg-[#f1f5f9] text-[#64748b]",
  contacted: "bg-[#f1f5f9] text-[#475569]",
  discovery: "bg-[#e8f0fe] text-[#1a73e8]",
  building_mvp: "bg-[#fef3e2] text-[#e67e22]",
  proposal: "bg-[#f3e5f5] text-[#8e24aa]",
  negotiation: "bg-[#fff8e1] text-[#f59e0b]",
  build: "bg-[#e8f5e9] text-[#27ae60]",
  deliver: "bg-[#e0f2f1] text-[#00897b]",
  maintain: "bg-[#e3f2fd] text-[#1565c0]",
  closed_won: "bg-[#e8f5e9] text-[#27ae60]",
  closed_lost: "bg-[#fde8e8] text-[#c0392b]",
};

export const STAGE_DOT_COLORS: Record<string, string> = {
  lead: "#64748b",
  contacted: "#475569",
  discovery: "#1a73e8",
  building_mvp: "#e67e22",
  proposal: "#8e24aa",
  negotiation: "#f59e0b",
  build: "#27ae60",
  deliver: "#00897b",
  maintain: "#1565c0",
};

export interface PipelineEngagement {
  id: string;
  name: string;
  stage: string;
  stageEnteredAt: Date | string;
  dealValue: string | null;
  expectedCloseDate: string | null;
  probability: string | null;
  source: string | null;
  companyName: string;
  contactName: string | null;
  nextActionDueDate: string | null;
}
