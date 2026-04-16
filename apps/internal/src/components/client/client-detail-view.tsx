"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  Pencil,
  Check,
  X,
  Plus,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  Zap,
  ArrowRightLeft,
  Trash2,
  Sparkles,
  Copy,
  Link2,
} from "lucide-react";
import { changeStage, quickAdd, toggleAction as serverToggleAction, updateEngagement, updateCompanyName, updateContact as updateContactAction, deleteEngagement, createFollowUpLink } from "@/app/actions";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

// ── Types ───────────────────────────────────────────────
type Engagement = {
  id: string;
  name: string;
  stage: string;
  stageEnteredAt: Date;
  dealValue: string | null;
  expectedCloseDate: string | null;
  probability: string | null;
  source: string | null;
  maintenanceOptedIn: boolean;
  maintenanceMonthlyFee: string | null;
  tags: string[];
  createdAt: Date;
  companyId: string;
  companyName: string;
  companyIndustry: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  nextActionDueDate: string | null;
  maintenanceNextCheckin: string | null;
};

type TimelineEntry = {
  id: string;
  type: string;
  content: string;
  scheduledAt: Date | null;
  createdAt: Date;
  authorName: string;
};

type ActionEntry = {
  id: string;
  description: string;
  priority?: "urgent" | "high" | "normal" | "low";
  dueDate: string | null;
  completed: boolean;
  completedAt: Date | null;
  ownerName: string;
  ownerId: string;
};

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  companyName: string;
  companyId: string;
};

// ── Constants ───────────────────────────────────────────
const STAGES = [
  "lead", "contacted", "discovery", "building_mvp", "proposal",
  "negotiation", "build", "deliver", "maintain",
  "closed_won", "closed_lost",
] as const;

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  lead: { label: "Lead", color: "#94a3b8", bg: "bg-slate-100 text-slate-600" },
  contacted: { label: "Contacted", color: "#64748b", bg: "bg-slate-100 text-slate-700" },
  discovery: { label: "Discovery", color: "#8b5cf6", bg: "bg-violet-100 text-violet-700" },
  building_mvp: { label: "Building MVP", color: "#e67e22", bg: "bg-orange-100 text-orange-700" },
  proposal: { label: "Proposal", color: "#6366f1", bg: "bg-indigo-100 text-indigo-700" },
  negotiation: { label: "Negotiation", color: "#f59e0b", bg: "bg-amber-100 text-amber-700" },
  build: { label: "Build", color: "#3b82f6", bg: "bg-blue-100 text-blue-700" },
  deliver: { label: "Deliver", color: "#06b6d4", bg: "bg-cyan-100 text-cyan-700" },
  maintain: { label: "Maintain", color: "#10b981", bg: "bg-emerald-100 text-emerald-700" },
  closed_won: { label: "Closed Won", color: "#10b981", bg: "bg-emerald-100 text-emerald-700" },
  closed_lost: { label: "Closed Lost", color: "#ef4444", bg: "bg-red-100 text-red-700" },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  meeting: Calendar,
  note: MessageSquare,
  action: Zap,
  stage_change: ArrowRightLeft,
};

const TYPE_COLORS: Record<string, string> = {
  meeting: "bg-blue-500",
  note: "bg-emerald-500",
  action: "bg-amber-500",
  stage_change: "bg-slate-400",
};

const PRIORITY_BADGE: Record<string, { label: string; cls: string } | null> = {
  urgent: { label: "Urgent", cls: "bg-red-50 text-red-700" },
  high: { label: "High", cls: "bg-amber-50 text-amber-700" },
  normal: null,
  low: { label: "Low", cls: "bg-slate-100 text-slate-600" },
};

// ── Stage Dropdown ──────────────────────────────────────
function StageDropdown({
  currentStage,
  onChange,
}: {
  currentStage: string;
  onChange: (stage: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const config = STAGE_CONFIG[currentStage] || STAGE_CONFIG.lead;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${config.bg}`}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        {config.label}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[180px] rounded-lg border border-border bg-white py-1 shadow-lg">
          {STAGES.map((stage) => {
            const sc = STAGE_CONFIG[stage];
            const isActive = stage === currentStage;
            return (
              <button
                key={stage}
                onClick={() => {
                  onChange(stage);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${
                  isActive ? "bg-muted font-semibold" : "hover:bg-muted/50"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: sc.color }}
                />
                {sc.label}
                {isActive && <Check size={12} className="ml-auto text-[#1a73e8]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inline Edit Field ───────────────────────────────────
function EditableField({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="flex justify-between py-1">
        <span className="text-[#888]">{label}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="group flex items-center gap-1 font-medium"
        >
          {value || <span className="text-[#ccc]">{"\u2014"}</span>}
          <Pencil size={10} className="text-transparent group-hover:text-[#aaa]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="text-[#888]">{label}</span>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="ml-auto w-[140px] rounded border border-[#1a73e8] bg-white px-2 py-0.5 text-right text-[13px] font-medium outline-none"
      />
      <button onClick={() => { onSave(draft); setEditing(false); }} className="text-[#1a73e8]">
        <Check size={12} />
      </button>
      <button onClick={() => setEditing(false)} className="text-[#aaa]">
        <X size={12} />
      </button>
    </div>
  );
}

// ── Add Timeline Entry ──────────────────────────────────
function AddTimelineForm({
  onAdd,
  onCancel,
  engagementId,
  teamMembers,
}: {
  onAdd: (entry: TimelineEntry) => void;
  onCancel: () => void;
  engagementId: string;
  teamMembers: { id: string; name: string }[];
}) {
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [, startSaving] = useTransition();

  useEffect(() => ref.current?.focus(), []);

  const handleSubmit = () => {
    if (!content.trim()) return;
    onAdd({
      id: `tl-${Date.now()}`,
      type,
      content: content.trim(),
      scheduledAt: null,
      createdAt: new Date(),
      authorName: teamMembers[0]?.name ?? "Team",
    });
    const formData = new FormData();
    formData.set("content", type === "note" ? content.trim() : `/${type} ${content.trim()}`);
    formData.set("engagementId", engagementId);
    startSaving(async () => {
      try {
        await quickAdd(formData);
        toast.success("Saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save note");
      }
    });
    setContent("");
  };

  return (
    <div className="mb-4 rounded-lg border border-[#1a73e8] bg-white p-3">
      <div className="mb-2 flex gap-1">
        {["note", "meeting", "action"].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
              type === t ? "bg-[#1a73e8] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What happened?"
        rows={2}
        className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="text-[12px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!content.trim()}
          className="rounded-md bg-[#1a73e8] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── People Section (editable) ───────────────────────────
function PeopleSection({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startContactTransition] = useTransition();

  const updateContact = (id: string, updates: Partial<Contact>) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
    const serverData: Record<string, string> = {};
    if (updates.name !== undefined) serverData.name = updates.name;
    if (updates.email !== undefined) serverData.email = updates.email ?? "";
    if (updates.phone !== undefined) serverData.phone = updates.phone ?? "";
    if (updates.role !== undefined) serverData.role = updates.role ?? "";
    if (Object.keys(serverData).length > 0) {
      startContactTransition(async () => {
        try {
          await updateContactAction(id, serverData);
          toast.success("Contact updated");
        } catch {
          toast.error("Failed to update contact");
        }
      });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        People
      </h3>
      {contacts.length > 0 ? (
        <div className="space-y-3">
          {contacts.map((contact) => {
            const isEditing = editingId === contact.id;
            return (
              <div key={contact.id}>
                <div
                  className="group flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-muted/50"
                  onClick={() => setEditingId(isEditing ? null : contact.id)}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {contact.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium">{contact.name}</p>
                      <Pencil size={10} className="text-transparent group-hover:text-muted-foreground" />
                    </div>
                    {contact.role && (
                      <p className="text-[11px] text-muted-foreground">{contact.role}</p>
                    )}
                    {!isEditing && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[10px] text-[#1a73e8] hover:underline"
                          >
                            <Mail size={9} />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Phone size={9} />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="ml-9 mt-1 space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
                    <EditableContactField
                      label="Name"
                      value={contact.name}
                      onSave={(v) => updateContact(contact.id, { name: v })}
                    />
                    <EditableContactField
                      label="Role"
                      value={contact.role || ""}
                      onSave={(v) => updateContact(contact.id, { role: v || null })}
                    />
                    <EditableContactField
                      label="Email"
                      value={contact.email || ""}
                      onSave={(v) => updateContact(contact.id, { email: v || null })}
                    />
                    <EditableContactField
                      label="Phone"
                      value={contact.phone || ""}
                      onSave={(v) => updateContact(contact.id, { phone: v || null })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No contacts.</p>
      )}
    </div>
  );
}

function EditableContactField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="flex items-center gap-2">
      <label className="w-[45px] shrink-0 text-[10px] text-muted-foreground">{label}</label>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(draft); (e.target as HTMLInputElement).blur(); }
        }}
        className="flex-1 rounded border border-border bg-white px-2 py-1 text-[12px] outline-none focus:border-[#1a73e8]"
      />
    </div>
  );
}

// ── Follow-up Link Section ──────────────────────────────
type FollowUpLink = {
  id: string;
  token: string;
  engagementId: string;
  meetingType: string;
  createdBy: string | null;
  createdAt: Date;
};

function FollowUpSection({
  engagementId,
  initialLinks,
}: {
  engagementId: string;
  initialLinks: FollowUpLink[];
}) {
  const [links, setLinks] = useState(initialLinks);
  const [meetingType, setMeetingType] = useState<"proposal" | "revision" | "in_person">("proposal");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    try {
      const token = await createFollowUpLink(engagementId, meetingType);
      setLinks((prev) => [
        { id: `local-${Date.now()}`, token, engagementId, meetingType, createdBy: null, createdAt: new Date() },
        ...prev,
      ]);
      toast.success("Link generated");
    } catch {
      toast.error("Failed to generate link");
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`https://strvx.com/book/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={12} className="text-muted-foreground" />
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Follow-up Links
        </h3>
      </div>

      {/* Existing links */}
      {links.length > 0 && (
        <div className="mb-3 space-y-2">
          {links.slice(0, 3).map((link) => (
            <div key={link.id} className="rounded-md border border-border bg-muted/30 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-medium capitalize text-muted-foreground">
                  {link.meetingType === "in_person" ? "In-Person" : link.meetingType}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex-1 truncate font-mono text-[10px] text-foreground">
                  strvx.com/book/{link.token.slice(0, 8)}…
                </span>
                <button
                  onClick={() => copyLink(link.token)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Copy link"
                >
                  {copied === link.token ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate new */}
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1">
          {(["proposal", "revision", "in_person"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMeetingType(t)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                meetingType === t
                  ? "bg-[#1a73e8] text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t === "in_person" ? "In-Person" : t}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="ml-auto flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50"
        >
          <Plus size={11} />
          {generating ? "Generating…" : "New Link"}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────
export function ClientDetailView({
  initialEngagement,
  initialTimeline,
  initialActions,
  initialContacts,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allEngagements,
  teamMembers,
  followUpLinks: initialFollowUpLinks,
}: {
  initialEngagement: Engagement;
  initialTimeline: TimelineEntry[];
  initialActions: ActionEntry[];
  initialContacts: Contact[];
  allEngagements: { id: string; name: string; companyName: string }[];
  teamMembers: { id: string; name: string }[];
  followUpLinks: FollowUpLink[];
}) {
  const [engagement, setEngagement] = useState(initialEngagement);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [actions, setActions] = useState(initialActions);
  const [showAddTimeline, setShowAddTimeline] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [proposalText, setProposalText] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [sentiment, setSentiment] = useState<{ score: number; trend: string; summary: string; recommendation: string } | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  const daysInStage = Math.floor(
    (now - new Date(engagement.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const updateField = (updates: Partial<Engagement>) => {
    setEngagement((prev) => ({ ...prev, ...updates }));
  };

  const addTimelineEntry = (entry: TimelineEntry) => {
    setTimeline((prev) => [entry, ...prev]);
    setShowAddTimeline(false);
  };

  const toggleAction = (actionId: string) => {
    setActions((prev) =>
      prev.map((a) =>
        a.id === actionId
          ? { ...a, completed: !a.completed, completedAt: a.completed ? null : new Date() }
          : a
      )
    );
    startTransition(async () => {
      try {
        await serverToggleAction(actionId);
      } catch {
        toast.error("Failed to toggle action");
      }
    });
  };

  const addAction = () => {
    if (!newActionText.trim()) return;
    setActions((prev) => [
      {
        id: `act-${Date.now()}`,
        description: newActionText.trim(),
        dueDate: null,
        completed: false,
        completedAt: null,
        ownerName: teamMembers[0]?.name ?? "Team",
        ownerId: teamMembers[0]?.id ?? "",
      },
      ...prev,
    ]);
    const formData = new FormData();
    formData.set("content", `/action ${newActionText.trim()}`);
    formData.set("engagementId", engagement.id);
    startTransition(async () => {
      try {
        await quickAdd(formData);
        toast.success("Saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save action");
      }
    });
    setNewActionText("");
    setShowAddAction(false);
  };

  const incomplete = actions.filter((a) => !a.completed);
  const completed = actions.filter((a) => a.completed);

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="relative z-50 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{engagement.companyName}</h1>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {engagement.contactName && `${engagement.contactName} \u00B7 `}
            {engagement.name}
            {engagement.companyIndustry && ` \u00B7 ${engagement.companyIndustry}`}
            {` \u00B7 ${daysInStage}d in stage`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StageDropdown
            currentStage={engagement.stage}
            onChange={(stage) => {
              updateField({ stage, stageEnteredAt: new Date() });
              startTransition(async () => {
                try {
                  await changeStage(engagement.id, stage as Parameters<typeof changeStage>[1]);
                  toast.success("Stage updated");
                } catch {
                  toast.error("Failed to change stage");
                }
              });
            }}
          />
          <button
            onClick={async () => {
              setSentimentLoading(true);
              try {
                const res = await fetch("/api/ai/sentiment", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ engagementId: engagement.id }),
                });
                const data = await res.json();
                if (data.score) setSentiment(data);
                else toast.error(data.error || "Failed to analyze");
              } catch { toast.error("Failed to analyze sentiment"); }
              finally { setSentimentLoading(false); }
            }}
            disabled={sentimentLoading}
            className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            {sentimentLoading ? "..." : sentiment ? (
              <span className={`flex items-center gap-1 ${sentiment.score >= 7 ? "text-[#27ae60]" : sentiment.score >= 4 ? "text-[#e67e22]" : "text-[#c0392b]"}`}>
                {sentiment.score}/10 {sentiment.trend === "improving" ? "↑" : sentiment.trend === "declining" ? "↓" : "→"}
              </span>
            ) : "Sentiment"}
          </button>
          <button
            onClick={async () => {
              setProposalLoading(true);
              try {
                const res = await fetch("/api/ai/proposal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ engagementId: engagement.id }),
                });
                const data = await res.json();
                if (data.proposal) setProposalText(data.proposal);
                else toast.error(data.error || "Failed to generate proposal");
              } catch { toast.error("Failed to generate proposal"); }
              finally { setProposalLoading(false); }
            }}
            disabled={proposalLoading}
            className="flex items-center gap-1.5 rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            <Sparkles size={12} />
            {proposalLoading ? "Generating..." : "Generate Proposal"}
          </button>
          <DeleteConfirmDialog
            name={engagement.companyName}
            onConfirm={async () => {
              try {
                await deleteEngagement(engagement.id);
                toast.success("Client deleted");
                router.push("/clients");
              } catch {
                toast.error("Failed to delete client");
              }
            }}
            trigger={
              <button className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50">
                <Trash2 size={12} />
                Delete
              </button>
            }
          />
        </div>
      </div>

      {/* Sentiment card */}
      {sentiment && (
        <div className="mb-4 flex items-start gap-4 rounded-lg border border-[#e0e0e0] bg-white px-4 py-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] font-bold ${
            sentiment.score >= 7 ? "bg-[#e6f9e6] text-[#27ae60]" : sentiment.score >= 4 ? "bg-[#fff3e0] text-[#e67e22]" : "bg-[#fde8e8] text-[#c0392b]"
          }`}>
            {sentiment.score}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#222]">{sentiment.summary}</p>
            <p className="mt-1 text-[12px] text-[#1a73e8]">{sentiment.recommendation}</p>
          </div>
          <button onClick={() => setSentiment(null)} className="shrink-0 rounded p-1 text-[#ccc] hover:bg-[#f0f0f0]">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Section headers row */}
      <div className="mb-3 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex items-center justify-between lg:col-span-2">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/gmail/sync", { method: "POST" });
                  const data = await res.json();
                  if (data.synced > 0) {
                    router.refresh();
                  }
                } catch { /* silent */ }
              }}
              className="flex items-center gap-1 rounded-md border border-[#e0e0e0] px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <Mail size={12} />
              Sync Emails
            </button>
            <button
              onClick={() => setShowAddTimeline(!showAddTimeline)}
              className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <Plus size={12} />
              Add Entry
            </button>
          </div>
        </div>
        <div className="hidden lg:block">
          <h2 className="text-sm font-semibold">Details</h2>
        </div>
      </div>

      {/* Add timeline form (above grid) */}
      {showAddTimeline && (
        <div className="mb-3 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AddTimelineForm
              onAdd={addTimelineEntry}
              onCancel={() => setShowAddTimeline(false)}
              engagementId={engagement.id}
              teamMembers={teamMembers}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Timeline — full width on mobile, 2/3 on desktop */}
        <div className="lg:col-span-2">
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-white lg:h-[calc(100vh-220px)] lg:max-h-none">
            {timeline.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No interactions yet.
              </div>
            ) : (
              timeline.map((entry, i) => {
                const Icon = TYPE_ICONS[entry.type] || MessageSquare;
                return (
                  <div
                    key={entry.id}
                    className={`flex gap-3 px-4 py-3 ${
                      i < timeline.length - 1 ? "border-b border-border/50" : ""
                    } ${entry.type === "stage_change" ? "bg-muted/30" : ""}`}
                  >
                    <div
                      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
                        TYPE_COLORS[entry.type] || "bg-slate-300"
                      }`}
                    >
                      <Icon size={11} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {entry.authorName}
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[9px] font-medium capitalize"
                        >
                          {entry.type.replace("_", " ")}
                        </Badge>
                        <span>
                          {new Date(entry.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {entry.scheduledAt && (
                          <span className="text-[#1a73e8]">
                            {new Date(entry.scheduledAt).toLocaleString("en-US", {
                              month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                        {entry.content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column — stacks below timeline on mobile */}
        <div className="flex flex-col gap-4 lg:h-[calc(100vh-220px)] lg:overflow-y-auto">
          {/* Details — editable */}
          <div className="rounded-lg border border-border bg-white p-4">
            <div className="space-y-0.5 text-[13px]">
              <EditableField
                label="Company"
                value={engagement.companyName}
                onSave={(v) => {
                  updateField({ companyName: v });
                  startTransition(async () => {
                    try {
                      await updateCompanyName(engagement.companyId, v);
                      toast.success("Company name updated");
                    } catch {
                      toast.error("Failed to update company name");
                    }
                  });
                }}
              />
              <EditableField
                label="Deal value"
                value={engagement.dealValue ? `$${Number(engagement.dealValue).toLocaleString()}` : ""}
                onSave={(v) => {
                  const cleanValue = v.replace(/[$,]/g, "") || null;
                  updateField({ dealValue: cleanValue });
                  startTransition(async () => {
                    try {
                      await updateEngagement(engagement.id, { dealValue: cleanValue });
                    } catch {
                      toast.error("Failed to update");
                    }
                  });
                }}
              />
              {engagement.maintenanceOptedIn && (
                <div className="flex justify-between py-1">
                  <span className="text-[#888]">Maintenance</span>
                  <span className="font-medium">
                    {engagement.maintenanceMonthlyFee
                      ? `$${Number(engagement.maintenanceMonthlyFee).toLocaleString()}/mo`
                      : "Opted in"}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-[#888]">Started</span>
                <span className="font-medium">
                  {new Date(engagement.createdAt).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* People — editable */}
          <PeopleSection initialContacts={initialContacts} />

          {/* Next Actions — fills remaining space */}
          <div className="flex-1 rounded-lg border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next Actions
              </h3>
              <button
                onClick={() => setShowAddAction(!showAddAction)}
                className="text-[#1a73e8] hover:text-[#1557b0]"
              >
                <Plus size={14} />
              </button>
            </div>

            {showAddAction && (
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="text"
                  value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addAction();
                    if (e.key === "Escape") { setShowAddAction(false); setNewActionText(""); }
                  }}
                  autoFocus
                  placeholder="New action..."
                  className="flex-1 rounded-md border border-border px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                />
                <button
                  onClick={addAction}
                  disabled={!newActionText.trim()}
                  className="text-[#1a73e8] disabled:opacity-30"
                >
                  <Check size={14} />
                </button>
              </div>
            )}

            <div className="space-y-1">
              {incomplete.map((action) => {
                const isOverdue = action.dueDate && new Date(action.dueDate) < new Date();
                const badge = action.priority ? PRIORITY_BADGE[action.priority] : null;
                return (
                  <div key={action.id} className="flex items-start gap-2 py-1 text-[13px]">
                    <button
                      onClick={() => toggleAction(action.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border transition-colors hover:border-[#1a73e8]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span>{action.description}</span>
                        {badge && (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </div>
                    {action.dueDate && (
                      <span className={`shrink-0 whitespace-nowrap text-[11px] ${isOverdue ? "font-semibold text-red-600" : "text-amber-600"}`}>
                        {isOverdue ? "Overdue" : "Due"}{" "}
                        {new Date(action.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                );
              })}
              {incomplete.length === 0 && !showAddAction && (
                <p className="text-[13px] text-muted-foreground">No actions.</p>
              )}
            </div>

            {completed.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  {completed.length} completed
                </summary>
                <div className="mt-1 space-y-1 opacity-50">
                  {completed.map((action) => (
                    <div key={action.id} className="flex items-start gap-2 py-1 text-[13px] line-through">
                      <button
                        onClick={() => toggleAction(action.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border bg-emerald-500"
                      />
                      <span>{action.description}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Follow-up Links */}
          <FollowUpSection
            engagementId={engagement.id}
            initialLinks={initialFollowUpLinks}
          />

        </div>
      </div>

      {/* Proposal Modal */}
      {proposalText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-[#e0e0e0] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#8e24aa]" />
                <h2 className="text-[16px] font-semibold text-[#222]">Generated Proposal</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(proposalText);
                    toast.success("Copied to clipboard");
                  }}
                  className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-[12px] font-medium text-[#555] hover:bg-[#f5f5f5]"
                >
                  Copy
                </button>
                <button
                  onClick={() => setProposalText(null)}
                  className="rounded p-1 text-[#888] hover:bg-[#f0f0f0]"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-4">
              <div className="prose prose-sm max-w-none text-[13px] text-[#333]">
                {proposalText.split("\n").map((line, i) => {
                  if (line.startsWith("# ")) return <h1 key={i} className="mb-2 mt-4 text-[18px] font-bold text-[#111]">{line.slice(2)}</h1>;
                  if (line.startsWith("## ")) return <h2 key={i} className="mb-2 mt-3 text-[15px] font-semibold text-[#222]">{line.slice(3)}</h2>;
                  if (line.startsWith("### ")) return <h3 key={i} className="mb-1 mt-2 text-[14px] font-semibold text-[#333]">{line.slice(4)}</h3>;
                  if (line.startsWith("- ")) return <li key={i} className="ml-4 text-[13px] text-[#555]">{line.slice(2)}</li>;
                  if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold text-[#222]">{line.slice(2, -2)}</p>;
                  if (line.trim() === "") return <div key={i} className="h-2" />;
                  return <p key={i} className="text-[13px] leading-relaxed text-[#555]">{line}</p>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
