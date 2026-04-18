"use client";

import { useState, useCallback, useRef, useEffect, startTransition } from "react";
import Link from "next/link";
import {
  changeStage,
  updateEngagement as updateEngagementAction,
  updateContact as updateContactAction,
  updateCompanyName,
  updateCompany,
  toggleAction as serverToggleAction,
  deleteAction as serverDeleteAction,
  quickAdd,
  deleteEngagement,
  createFollowUpLink,
} from "@/app/actions";
import { stageEnum } from "@/lib/db/schema";
import { toast } from "sonner";
import {
  KANBAN_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  STAGE_DOT_COLORS,
} from "@/lib/pipeline-constants";
import {
  Building2,
  DollarSign,
  Users,
  AlertTriangle,
  X,
  Check,
  Pencil,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  Zap,
  ArrowRightLeft,
  ExternalLink,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Link2,
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";


import { CreateEngagementForm } from "@/components/create-engagement-form";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

// ── Types ────────────────────────────────────────────────

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
  tags: string[] | null;
  createdAt: Date;
  companyId: string;
  companyName: string;
  companyIndustry: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  nextActionDueDate: string | null;
  maintenanceNextCheckin: string | null;
};

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedinUrl: string | null;
  companyName: string;
  companyId: string;
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

// ── Constants ────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = Object.fromEntries(
  Object.entries(STAGE_LABELS).map(([key, label]) => [
    key,
    { label, color: STAGE_DOT_COLORS[key] || "#64748b", bg: STAGE_COLORS[key] || "bg-slate-100 text-slate-600" },
  ])
);

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

// ── Helpers ──────────────────────────────────────────────

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function daysInStage(stageEnteredAt: Date): number {
  return Math.floor(
    (Date.now() - new Date(stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function daysColor(days: number): string {
  if (days > 30) return "bg-red-50 text-red-600";
  if (days > 14) return "bg-amber-50 text-amber-600";
  return "bg-emerald-50 text-emerald-600";
}

// ── SectionCard ──────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-[#fafafa] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ── InlineEdit ───────────────────────────────────────────

function InlineEdit({
  label,
  value,
  placeholder,
  type = "text",
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div
        className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-white"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="truncate text-[13px] text-foreground">
            {value || (
              <span className="text-muted-foreground/50">
                {placeholder || "Empty"}
              </span>
            )}
          </p>
        </div>
        <Pencil
          size={11}
          className="shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#1a73e8] bg-white px-2 py-1.5">
      <p className="text-[10px] text-[#1a73e8]">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(draft);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] outline-none"
        />
        <button
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-[#1a73e8] hover:bg-blue-50"
        >
          <Check size={12} />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ── ContactsList ─────────────────────────────────────────

function ContactsList({ contacts }: { contacts: Contact[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const saveContactField = useCallback(
    (contactId: string, data: Record<string, string>) => {
      startTransition(async () => {
        try {
          await updateContactAction(contactId, data);
          toast.success("Contact updated");
        } catch {
          toast.error("Failed to update contact");
        }
      });
    },
    []
  );

  if (contacts.length === 0) {
    return (
      <p className="px-2 py-1 text-[13px] text-muted-foreground">
        No contacts linked.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {contacts.map((c) => {
        const isEditing = editingId === c.id;
        return (
          <div key={c.id}>
            <div
              className="group flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-white"
              onClick={() => setEditingId(isEditing ? null : c.id)}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/contacts/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[13px] font-medium text-[#1a73e8] hover:underline"
                  >
                    {c.name}
                  </Link>
                  <Pencil
                    size={10}
                    className="text-transparent group-hover:text-muted-foreground"
                  />
                </div>
                {c.role && (
                  <p className="text-[11px] text-muted-foreground">{c.role}</p>
                )}
                {!isEditing && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[10px] text-[#1a73e8] hover:underline"
                      >
                        <Mail size={9} />
                        {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Phone size={9} />
                        {c.phone}
                      </span>
                    )}
                    {c.linkedinUrl && (
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[10px] text-[#0077b5] hover:underline"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        LinkedIn
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            {isEditing && (
              <div className="ml-9 mt-1 space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
                <ContactField label="Name" value={c.name} onSave={(v) => saveContactField(c.id, { name: v })} />
                <ContactField label="Role" value={c.role || ""} onSave={(v) => saveContactField(c.id, { role: v })} />
                <ContactField label="Email" value={c.email || ""} onSave={(v) => saveContactField(c.id, { email: v })} />
                <ContactField label="Phone" value={c.phone || ""} onSave={(v) => saveContactField(c.id, { phone: v })} />
                <ContactField label="LinkedIn" value={c.linkedinUrl || ""} onSave={(v) => saveContactField(c.id, { linkedinUrl: v })} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContactField({
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
      <label className="w-[45px] shrink-0 text-[10px] text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) {
            onSave(draft);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="flex-1 rounded border border-border bg-white px-2 py-1 text-[12px] outline-none focus:border-[#1a73e8]"
      />
    </div>
  );
}

// ── TimelinePreview ──────────────────────────────────────

function TimelinePreview({ entries }: { entries: TimelineEntry[] }) {
  const recent = entries.slice(0, 5);

  if (recent.length === 0) {
    return (
      <p className="px-2 py-1 text-[13px] text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {recent.map((entry, i) => {
        const Icon = TYPE_ICONS[entry.type] || MessageSquare;
        return (
          <div
            key={entry.id}
            className={`flex gap-2.5 px-1 py-2 ${
              i < recent.length - 1 ? "border-b border-border/50" : ""
            }`}
          >
            <div
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                TYPE_COLORS[entry.type] || "bg-slate-300"
              }`}
            >
              <Icon size={9} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {entry.authorName}
                </span>
                <span className="capitalize">
                  {entry.type.replace("_", " ")}
                </span>
                <span>
                  {new Date(entry.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-foreground line-clamp-2">
                {entry.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ActionsPreview ───────────────────────────────────────

function ActionsPreview({
  actions,
  onToggle,
  onAdd,
  onDelete,
}: {
  actions: ActionEntry[];
  onToggle: (id: string) => void;
  onAdd: (description: string) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<"pending" | "completed">("pending");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const pending = actions.filter((a) => !a.completed);
  const completed = actions.filter((a) => a.completed);

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd(newText.trim());
    setNewText("");
    setAdding(false);
  };

  return (
    <div>
      {/* Tabs + Add button */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("pending")}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              tab === "pending"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab("completed")}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              tab === "completed"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Done ({completed.length})
          </button>
        </div>
        <button
          onClick={() => { setAdding(true); setTab("pending"); }}
          className="text-[#1a73e8] hover:text-[#1557b0]"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Add inline input */}
      {adding && (
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewText(""); }
            }}
            autoFocus
            placeholder="New action..."
            className="min-w-0 flex-1 rounded border border-border px-2 py-1 text-[12px] outline-none focus:border-[#1a73e8]"
          />
          <button
            onClick={handleAdd}
            disabled={!newText.trim()}
            className="text-[#1a73e8] disabled:opacity-30"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => { setAdding(false); setNewText(""); }}
            className="text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Pending tab */}
      {tab === "pending" && (
        <div className="space-y-1">
          {pending.length === 0 && !adding && (
            <p className="px-1 py-1 text-[12px] text-muted-foreground">
              No pending actions.
            </p>
          )}
          {pending.map((action) => {
            const isOverdue =
              action.dueDate && new Date(action.dueDate) < new Date();
            const badge = action.priority
              ? PRIORITY_BADGE[action.priority]
              : null;
            return (
              <div
                key={action.id}
                className="group flex items-start gap-2 px-1 py-1 text-[13px]"
              >
                <button
                  onClick={() => onToggle(action.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border transition-colors hover:border-[#1a73e8]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px]">{action.description}</span>
                    {badge && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
                {action.dueDate && (
                  <span
                    className={`shrink-0 whitespace-nowrap text-[10px] ${
                      isOverdue
                        ? "font-semibold text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isOverdue ? "Overdue" : "Due"}{" "}
                    {new Date(
                      action.dueDate + "T00:00:00"
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
                <button
                  onClick={() => onDelete(action.id)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed tab */}
      {tab === "completed" && (
        <div className="space-y-1">
          {completed.length === 0 && (
            <p className="px-1 py-1 text-[12px] text-muted-foreground">
              No completed actions.
            </p>
          )}
          {completed.map((action) => (
            <div
              key={action.id}
              className="group flex items-start gap-2 px-1 py-1 text-[13px] opacity-60"
            >
              <button
                onClick={() => onToggle(action.id)}
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500 bg-emerald-500 transition-colors hover:bg-emerald-400"
              >
                <Check size={10} className="text-white" />
              </button>
              <span className="min-w-0 flex-1 text-[12px] line-through">
                {action.description}
              </span>
              <button
                onClick={() => onDelete(action.id)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stage Dropdown ───────────────────────────────────────

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
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-[180px] rounded-lg border border-border bg-white py-1 shadow-lg">
          {KANBAN_STAGES.map((stage) => {
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
                  isActive
                    ? "bg-muted font-semibold"
                    : "hover:bg-muted/50"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: sc.color }}
                />
                {sc.label}
                {isActive && (
                  <Check size={12} className="ml-auto text-[#1a73e8]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

type FollowUpLink = {
  id: string;
  token: string;
  engagementId: string;
  meetingType: string;
  createdBy: string | null;
  createdAt: Date;
};

export function ClientsTable({
  initialEngagements,
  initialContacts,
  initialTimeline,
  initialActions,
  initialFollowUpLinks,
  teamMembers,
}: {
  initialEngagements: Engagement[];
  initialContacts: Record<string, Contact[]>;
  initialTimeline: Record<string, TimelineEntry[]>;
  initialActions: Record<string, ActionEntry[]>;
  initialFollowUpLinks: Record<string, FollowUpLink[]>;
  teamMembers: { id: string; name: string }[];
}) {
  const [engagements, setEngagements] = useState<Engagement[]>(initialEngagements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actions, setActions] = useState(initialActions);
  const [followUpLinks, setFollowUpLinks] = useState(initialFollowUpLinks);
  const [showNewEngagement, setShowNewEngagement] = useState(false);

  type SortKey = "company" | "engagement" | "contact" | "stage" | "value" | "days" | "source";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (col: SortKey) => {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-[#ccc]" />;
    return sortDir === "asc" ? <ArrowUp size={12} className="text-[#111]" /> : <ArrowDown size={12} className="text-[#111]" />;
  };

  const sortedEngagements = [...engagements].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "company": return dir * a.companyName.localeCompare(b.companyName);
      case "engagement": return dir * a.name.localeCompare(b.name);
      case "contact": return dir * (a.contactName ?? "").localeCompare(b.contactName ?? "");
      case "stage": return dir * a.stage.localeCompare(b.stage);
      case "value": return dir * ((Number(a.dealValue) || 0) - (Number(b.dealValue) || 0));
      case "days": return dir * (daysInStage(a.stageEnteredAt) - daysInStage(b.stageEnteredAt));
      case "source": return dir * (a.source ?? "").localeCompare(b.source ?? "");
      default: return 0;
    }
  });

  const selectedEng = selectedId
    ? engagements.find((e) => e.id === selectedId) || null
    : null;

  const companyContacts = selectedEng
    ? initialContacts[selectedEng.companyId] || []
    : [];

  const engTimeline = selectedId
    ? initialTimeline[selectedId as keyof typeof initialTimeline] || []
    : [];

  const engActions = selectedId
    ? actions[selectedId as keyof typeof actions] || []
    : [];

  const engFollowUpLinks = selectedId
    ? followUpLinks[selectedId] || []
    : [];

  const updateEngagement = useCallback(
    (id: string, updates: Partial<Engagement>) => {
      setEngagements((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
      );
    },
    []
  );

  const toggleAction = useCallback((actionId: string) => {
    setActions((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const k = key as keyof typeof next;
        next[k] = next[k].map((a) =>
          a.id === actionId
            ? {
                ...a,
                completed: !a.completed,
                completedAt: a.completed ? null : new Date(),
              }
            : a
        );
      }
      return next;
    });
    startTransition(async () => {
      try {
        await serverToggleAction(actionId);
      } catch {
        toast.error("Failed to toggle action");
      }
    });
  }, []);

  const deleteAction = useCallback((actionId: string) => {
    setActions((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const k = key as keyof typeof next;
        next[k] = next[k].filter((a) => a.id !== actionId);
      }
      return next;
    });
    startTransition(async () => {
      try {
        await serverDeleteAction(actionId);
      } catch {
        toast.error("Failed to delete action");
      }
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <button
          onClick={() => setShowNewEngagement(true)}
          className="flex items-center gap-1.5 rounded-md bg-[#222] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#444]"
        >
          <Plus size={14} />
          Add Client
        </button>
      </div>

      {showNewEngagement && (
        <CreateEngagementForm onClose={() => setShowNewEngagement(false)} />
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-white">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                <TableHead className="text-[11px] border-r border-[#f0f0f0]"><button type="button" onClick={() => toggleSort("company")} className="flex items-center gap-1"><span>Company</span>{renderSortIcon("company")}</button></TableHead>
                <TableHead className="text-[11px] border-r border-[#f0f0f0]"><button type="button" onClick={() => toggleSort("engagement")} className="flex items-center gap-1"><span>Engagement</span>{renderSortIcon("engagement")}</button></TableHead>
                <TableHead className="text-[11px] border-r border-[#f0f0f0]"><button type="button" onClick={() => toggleSort("contact")} className="flex items-center gap-1"><span>Contact</span>{renderSortIcon("contact")}</button></TableHead>
                <TableHead className="text-[11px] border-r border-[#f0f0f0]"><button type="button" onClick={() => toggleSort("stage")} className="flex items-center gap-1"><span>Stage</span>{renderSortIcon("stage")}</button></TableHead>
                <TableHead className="text-right text-[11px] border-r border-[#f0f0f0]"><button type="button" onClick={() => toggleSort("value")} className="flex items-center justify-end gap-1"><span>Value</span>{renderSortIcon("value")}</button></TableHead>
                <TableHead className="text-center text-[11px] border-r border-[#f0f0f0]"><button type="button" onClick={() => toggleSort("days")} className="flex items-center justify-center gap-1"><span>Days</span>{renderSortIcon("days")}</button></TableHead>
                <TableHead className="text-[11px]"><button type="button" onClick={() => toggleSort("source")} className="flex items-center gap-1"><span>Source</span>{renderSortIcon("source")}</button></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEngagements.map((eng) => {
                const days = daysInStage(eng.stageEnteredAt);
                const isOverdue =
                  eng.nextActionDueDate &&
                  new Date(eng.nextActionDueDate) < new Date();
                const config = STAGE_CONFIG[eng.stage] || STAGE_CONFIG.lead;
                const isSelected = eng.id === selectedId;

                return (
                  <TableRow
                    key={eng.id}
                    data-state={isSelected ? "selected" : undefined}
                    onClick={() => setSelectedId(eng.id)}
                    className="cursor-pointer transition-colors"
                  >
                    <TableCell className="border-r border-[#f0f0f0]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground">
                          {eng.companyName}
                        </span>
                        {isOverdue && (
                          <AlertTriangle
                            size={12}
                            className="shrink-0 text-red-500"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {eng.companyIndustry}
                      </p>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground border-r border-[#f0f0f0]">
                      {eng.name}
                    </TableCell>
                    <TableCell className="border-r border-[#f0f0f0]">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback>
                            {initials(eng.contactName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[13px]">{eng.contactName || "No contact"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="border-r border-[#f0f0f0]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.bg}`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: config.color }}
                        />
                        {config.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums border-r border-[#f0f0f0]">
                      {eng.dealValue
                        ? `$${Number(eng.dealValue).toLocaleString()}`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center border-r border-[#f0f0f0]">
                      <span
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${daysColor(days)}`}
                      >
                        {days}d
                      </span>
                    </TableCell>
                    <TableCell>
                      {eng.source ? (
                        <Badge
                          variant="secondary"
                          className="capitalize text-[10px]"
                        >
                          {eng.source}
                        </Badge>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">
                          {"\u2014"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-[440px] flex flex-col overflow-hidden p-0" showCloseButton={false}>
          {selectedEng && (
            <>
              {/* Sheet Header */}
              <SheetHeader className="shrink-0 border-b border-border px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate text-[16px]">
                      {selectedEng.companyName}
                    </SheetTitle>
                    <SheetDescription className="mt-0.5 truncate">
                      {selectedEng.name}
                    </SheetDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <StageDropdown
                      currentStage={selectedEng.stage}
                      onChange={async (stage) => {
                        const prev = selectedEng.stage;
                        updateEngagement(selectedEng.id, {
                          stage,
                          stageEnteredAt: new Date(),
                        });
                        try {
                          await changeStage(selectedEng.id, stage as (typeof stageEnum.enumValues)[number]);
                          toast.success(`Stage changed to ${STAGE_CONFIG[stage]?.label || stage}`);
                        } catch {
                          updateEngagement(selectedEng.id, { stage: prev });
                          toast.error("Failed to update stage");
                        }
                      }}
                    />
                    <button
                      onClick={() => setSelectedId(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </SheetHeader>

              {/* Scrollable Body */}
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 px-5 py-4">
                  {/* Company */}
                  <SectionCard
                    icon={<Building2 size={13} />}
                    title="Company"
                  >
                    <InlineEdit
                      label="Name"
                      value={selectedEng.companyName}
                      onSave={(v) => {
                        updateEngagement(selectedEng.id, { companyName: v });
                        startTransition(async () => {
                          try {
                            await updateCompanyName(selectedEng.companyId, v);
                            toast.success("Company name updated");
                          } catch {
                            toast.error("Failed to update company name");
                          }
                        });
                      }}
                    />
                    <InlineEdit
                      label="Industry"
                      value={selectedEng.companyIndustry || ""}
                      onSave={(v) => {
                        updateEngagement(selectedEng.id, {
                          companyIndustry: v,
                        });
                        startTransition(async () => {
                          try {
                            await updateCompany(selectedEng.companyId, { industry: v || null });
                            toast.success("Industry updated");
                          } catch {
                            toast.error("Failed to update industry");
                          }
                        });
                      }}
                    />
                  </SectionCard>

                  {/* Deal */}
                  <SectionCard
                    icon={<DollarSign size={13} />}
                    title="Deal"
                  >
                    <InlineEdit
                      label="Engagement"
                      value={selectedEng.name}
                      onSave={(v) => {
                        updateEngagement(selectedEng.id, { name: v });
                        startTransition(async () => {
                          try {
                            await updateEngagementAction(selectedEng.id, { name: v });
                            toast.success("Engagement name updated");
                          } catch {
                            toast.error("Failed to update engagement name");
                          }
                        });
                      }}
                    />
                    <InlineEdit
                      label="Value"
                      value={selectedEng.dealValue || ""}
                      placeholder="No value set"
                      onSave={(v) => {
                        updateEngagement(selectedEng.id, {
                          dealValue: v || null,
                        });
                        startTransition(async () => {
                          try {
                            await updateEngagementAction(selectedEng.id, {
                              dealValue: v || null,
                            });
                            toast.success("Deal value saved");
                          } catch {
                            toast.error("Failed to save deal value");
                          }
                        });
                      }}
                    />
                    <InlineEdit
                      label="Probability"
                      value={selectedEng.probability || ""}
                      placeholder="e.g. 75%"
                      onSave={(v) => {
                        updateEngagement(selectedEng.id, {
                          probability: v || null,
                        });
                        startTransition(async () => {
                          try {
                            await updateEngagementAction(selectedEng.id, {
                              probability: v || null,
                            });
                            toast.success("Probability saved");
                          } catch {
                            toast.error("Failed to save probability");
                          }
                        });
                      }}
                    />
                    <InlineEdit
                      label="Expected Close"
                      value={selectedEng.expectedCloseDate || ""}
                      placeholder="YYYY-MM-DD"
                      type="date"
                      onSave={(v) => {
                        updateEngagement(selectedEng.id, {
                          expectedCloseDate: v || null,
                        });
                        startTransition(async () => {
                          try {
                            await updateEngagementAction(selectedEng.id, {
                              expectedCloseDate: v || null,
                            });
                            toast.success("Expected close date saved");
                          } catch {
                            toast.error("Failed to save expected close date");
                          }
                        });
                      }}
                    />
                    <div className="flex items-center justify-between rounded-md px-2 py-1.5">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Source
                        </p>
                        <p className="text-[13px] capitalize text-foreground">
                          {selectedEng.source || "\u2014"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">
                          In stage
                        </p>
                        <p className="text-[13px] font-medium text-foreground">
                          {daysInStage(selectedEng.stageEnteredAt)}d
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  {/* People */}
                  <SectionCard icon={<Users size={13} />} title="People">
                    <ContactsList contacts={companyContacts} />
                  </SectionCard>

                  {/* Timeline */}
                  <SectionCard
                    icon={<MessageSquare size={13} />}
                    title="Recent Activity"
                  >
                    <TimelinePreview entries={engTimeline} />
                  </SectionCard>

                  {/* Actions */}
                  <SectionCard icon={<Zap size={13} />} title="Next Actions">
                    <ActionsPreview
                      actions={engActions}
                      onToggle={toggleAction}
                      onDelete={deleteAction}
                      onAdd={(desc) => {
                        if (!selectedId) return;
                        const k = selectedId as keyof typeof actions;
                        const newAction: ActionEntry = {
                          id: `act-${Date.now()}`,
                          description: desc,
                          dueDate: null,
                          completed: false,
                          completedAt: null,
                          ownerName: teamMembers[0]?.name ?? "Unknown",
                          ownerId: teamMembers[0]?.id ?? "",
                        };
                        setActions((prev) => ({
                          ...prev,
                          [k]: [newAction, ...(prev[k] || [])],
                        }));
                        const formData = new FormData();
                        formData.set("content", `/action ${desc}`);
                        formData.set("engagementId", selectedId);
                        startTransition(async () => {
                          try {
                            await quickAdd(formData);
                            toast.success("Action saved");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to save action");
                          }
                        });
                      }}
                    />
                  </SectionCard>

                  {/* Follow-up Links */}
                  <SectionCard icon={<Link2 size={13} />} title="Booking Links">
                    <div className="space-y-2">
                      {engFollowUpLinks.length === 0 && (
                        <p className="px-1 py-1 text-[12px] text-muted-foreground">
                          No booking links yet.
                        </p>
                      )}
                      {engFollowUpLinks.map((link) => {
                        const url = `https://strvx.com/book/${link.token}`;
                        return (
                          <div key={link.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                              {link.meetingType === "proposal"
                                ? "Proposal"
                                : link.meetingType === "in_person"
                                ? "In-Person"
                                : "Revision"}{" "}
                              · strvx.com/book/{link.token.slice(0, 8)}…
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(url);
                                toast.success("Link copied!");
                              }}
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              title="Copy link"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        );
                      })}
                      <div className="flex gap-1.5 pt-1">
                        {(["proposal", "revision", "in_person"] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => {
                              if (!selectedId) return;
                              startTransition(async () => {
                                try {
                                  const token = await createFollowUpLink(selectedId, type);
                                  const newLink: FollowUpLink = {
                                    id: `fl-${Date.now()}`,
                                    token,
                                    engagementId: selectedId,
                                    meetingType: type,
                                    createdBy: null,
                                    createdAt: new Date(),
                                  };
                                  setFollowUpLinks((prev) => ({
                                    ...prev,
                                    [selectedId]: [newLink, ...(prev[selectedId] || [])],
                                  }));
                                  await navigator.clipboard.writeText(`https://strvx.com/book/${token}`);
                                  const typeLabel =
                                    type === "proposal"
                                      ? "Proposal"
                                      : type === "in_person"
                                      ? "In-Person"
                                      : "Revision";
                                  toast.success(`${typeLabel} link created & copied!`);
                                } catch {
                                  toast.error("Failed to create link");
                                }
                              });
                            }}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-[#1a73e8] hover:text-[#1a73e8]"
                          >
                            <Sparkles size={10} />
                            New {type === "proposal" ? "Proposal" : type === "in_person" ? "In-Person" : "Revision"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>
              </ScrollArea>

              {/* Footer */}
              <SheetFooter className="border-t border-border px-5 py-3">
                <div className="flex w-full items-center gap-2">
                  <Link
                    href={`/clients/${selectedEng.id}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#222] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#444]"
                  >
                    View full details
                    <ExternalLink size={12} />
                  </Link>
                  <DeleteConfirmDialog
                    name={selectedEng.companyName}
                    onConfirm={async () => {
                      try {
                        await deleteEngagement(selectedEng.id);
                        setSelectedId(null);
                        toast.success("Client deleted");
                      } catch {
                        toast.error("Failed to delete client");
                      }
                    }}
                    trigger={
                      <button
                        className="flex items-center justify-center rounded-md border border-red-200 px-3 py-2 text-red-600 transition-colors hover:bg-red-50"
                        title="Delete client"
                      >
                        <Trash2 size={14} />
                      </button>
                    }
                  />
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
