"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  Check,
  X,
  Plus,
  Mail,
  Phone,
  Globe,
  Building2,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  changePartnerStage,
  updatePartner,
  createPartnerContact,
  deletePartnerContact,
  createPartnerLink,
  deletePartnerLink,
  createPartnerInteraction,
  archivePartner,
} from "@/app/actions";
import {
  PARTNER_STAGE_LABELS,
  PARTNER_STAGE_COLORS,
  PARTNER_STAGE_DOT_COLORS,
  PARTNER_LINK_ROLE_LABELS,
  PARTNER_TAG_COLORS,
  PARTNER_KANBAN_STAGES,
} from "@/lib/partner-constants";
import { STAGE_COLORS } from "@/lib/pipeline-constants";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

// ── Types ────────────────────────────────────────────────

type Partner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  linkedinUrl: string | null;
  stage: string;
  stageEnteredAt: Date;
  tags: string[] | null;
  commissionRate: string | null;
  hourlyRate: string | null;
  flatRate: string | null;
  notes: string | null;
  createdAt: Date;
};

type PartnerContact = {
  id: string;
  partnerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedinUrl: string | null;
  createdAt: Date;
};

type LinkedEngagement = {
  linkId: string;
  role: string;
  terms: string | null;
  engagementId: string;
  engagementName: string;
  engagementStage: string;
  companyName: string;
  createdAt: Date;
};

type LinkedProject = {
  linkId: string;
  role: string;
  projectId: string;
  projectName: string;
  projectStatus: string | null;
  createdAt: Date;
};

type TimelineEntry = {
  id: string;
  type: string;
  content: string;
  createdAt: Date;
  authorName: string;
};

type Engagement = {
  id: string;
  name: string;
  companyName: string;
};

// ── Helpers ──────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Stage Dropdown ───────────────────────────────────────

function PartnerStageDropdown({
  currentStage,
  onChange,
}: {
  currentStage: string;
  onChange: (stage: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  const colorCls = PARTNER_STAGE_COLORS[currentStage] ?? "bg-muted text-muted-foreground";
  const dotColor = PARTNER_STAGE_DOT_COLORS[currentStage] ?? "#aaa";
  const label = PARTNER_STAGE_LABELS[currentStage] ?? currentStage;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${colorCls}`}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[180px] rounded-lg border border-border bg-white py-1 shadow-lg">
          {PARTNER_KANBAN_STAGES.map((stage) => {
            const isActive = stage === currentStage;
            const sc = PARTNER_STAGE_COLORS[stage] ?? "";
            const dot = PARTNER_STAGE_DOT_COLORS[stage] ?? "#aaa";
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
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
                <span className={`rounded px-1 text-[11px] font-medium ${sc}`}>
                  {PARTNER_STAGE_LABELS[stage]}
                </span>
                {isActive && <Check size={12} className="ml-auto text-[#1a73e8]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inline Editable Field ────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  type = "text",
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="flex justify-between py-1">
        <span className="text-[#888]">{label}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="group flex items-center gap-1 font-medium text-[13px]"
        >
          {value
            ? <span>{prefix}{value}{suffix}</span>
            : <span className="text-[#ccc]">—</span>}
          <Pencil size={10} className="text-transparent group-hover:text-[#aaa]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="text-[#888] text-[13px]">{label}</span>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="ml-auto w-[160px] rounded border border-[#1a73e8] bg-white px-2 py-0.5 text-right text-[13px] font-medium outline-none"
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

// ── Section Header ───────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#aaa]">{title}</h3>
      {action}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export function PartnerDetailView({
  partner,
  contacts,
  linkedEngagements,
  linkedProjects,
  timeline,
  allEngagements,
}: {
  partner: Partner;
  contacts: PartnerContact[];
  linkedEngagements: LinkedEngagement[];
  linkedProjects: LinkedProject[];
  timeline: TimelineEntry[];
  allEngagements: Engagement[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local state
  const [stage, setStage] = useState(partner.stage);
  const [localContacts, setLocalContacts] = useState(contacts);
  const [localLinkedEngagements, setLocalLinkedEngagements] = useState(linkedEngagements);
  const [localLinkedProjects, setLocalLinkedProjects] = useState(linkedProjects);
  const [localTimeline, setLocalTimeline] = useState(timeline);

  // Form visibility
  const [showAddContact, setShowAddContact] = useState(false);
  const [showLinkEngagement, setShowLinkEngagement] = useState(false);
  const [showLinkProject, setShowLinkProject] = useState(false);
  const [showLogInteraction, setShowLogInteraction] = useState(false);

  // ── Stage change ──
  const handleStageChange = (newStage: string) => {
    setStage(newStage);
    startTransition(async () => {
      try {
        await changePartnerStage(
          partner.id,
          newStage as Parameters<typeof changePartnerStage>[1]
        );
        toast.success("Stage updated");
      } catch {
        toast.error("Failed to update stage");
        setStage(partner.stage);
      }
    });
  };

  // ── Field update ──
  const handleFieldUpdate = (field: string, value: string) => {
    startTransition(async () => {
      try {
        await updatePartner(partner.id, { [field]: value || null });
        toast.success("Saved");
      } catch {
        toast.error("Failed to save");
      }
    });
  };

  return (
    <div className="pb-24">
      {/* Page header */}
      <div className="relative z-50 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{partner.name}</h1>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            {partner.company && <span>{partner.company} · </span>}
            <span>Partner since {new Date(partner.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PartnerStageDropdown currentStage={stage} onChange={handleStageChange} />
          <DeleteConfirmDialog
            name={partner.name}
            onConfirm={async () => {
              try {
                await archivePartner(partner.id);
                toast.success("Partner archived");
                router.push("/partners");
              } catch {
                toast.error("Failed to archive partner");
              }
            }}
            trigger={
              <button className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50">
                <Trash2 size={12} />
                Archive
              </button>
            }
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-4" style={{ flex: "1.2" }}>

          {/* ── Header / Info card ── */}
          <div className="rounded-lg border border-border bg-white p-4">
            {/* Tags */}
            {partner.tags && partner.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {partner.tags.map((tag) => {
                  const colors = PARTNER_TAG_COLORS[tag];
                  return (
                    <span
                      key={tag}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${colors ? `${colors.bg} ${colors.text}` : "bg-muted text-muted-foreground"}`}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Contact info */}
            <SectionHeader title="Contact Info" />
            <div className="space-y-0.5 text-[13px]">
              <EditableField
                label="Email"
                value={partner.email ?? ""}
                onSave={(v) => handleFieldUpdate("email", v)}
              />
              <EditableField
                label="Phone"
                value={partner.phone ?? ""}
                onSave={(v) => handleFieldUpdate("phone", v)}
              />
              <EditableField
                label="Company"
                value={partner.company ?? ""}
                onSave={(v) => handleFieldUpdate("company", v)}
              />
              <EditableField
                label="Website"
                value={partner.website ?? ""}
                onSave={(v) => handleFieldUpdate("website", v)}
              />
              <EditableField
                label="LinkedIn"
                value={partner.linkedinUrl ?? ""}
                onSave={(v) => handleFieldUpdate("linkedinUrl", v)}
              />
            </div>

            {/* Quick links row */}
            {(partner.email || partner.phone || partner.website || partner.linkedinUrl) && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {partner.email && (
                  <a href={`mailto:${partner.email}`} className="flex items-center gap-1 text-[11px] text-[#1a73e8] hover:underline">
                    <Mail size={11} /> Email
                  </a>
                )}
                {partner.phone && (
                  <a href={`tel:${partner.phone}`} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <Phone size={11} /> Call
                  </a>
                )}
                {partner.website && (
                  <a href={partner.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <Globe size={11} /> Website
                  </a>
                )}
                {partner.linkedinUrl && (
                  <a href={partner.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <ExternalLink size={11} /> LinkedIn
                  </a>
                )}
              </div>
            )}

            {/* Rate fields */}
            <div className="mt-3 border-t border-border pt-3">
              <SectionHeader title="Rates" />
              <div className="space-y-0.5 text-[13px]">
                <EditableField
                  label="Commission %"
                  value={partner.commissionRate ?? ""}
                  onSave={(v) => handleFieldUpdate("commissionRate", v)}
                  suffix="%"
                />
                <EditableField
                  label="Hourly Rate"
                  value={partner.hourlyRate ?? ""}
                  onSave={(v) => handleFieldUpdate("hourlyRate", v)}
                  prefix="$"
                  suffix="/hr"
                />
                <EditableField
                  label="Flat Rate"
                  value={partner.flatRate ?? ""}
                  onSave={(v) => handleFieldUpdate("flatRate", v)}
                  prefix="$"
                />
              </div>
            </div>
          </div>

          {/* ── Linked Engagements card ── */}
          <LinkedEngagementsCard
            partnerId={partner.id}
            linkedEngagements={localLinkedEngagements}
            allEngagements={allEngagements}
            onAdded={(entry) => setLocalLinkedEngagements((prev) => [entry, ...prev])}
            onRemoved={(linkId) => setLocalLinkedEngagements((prev) => prev.filter((l) => l.linkId !== linkId))}
            showLinkForm={showLinkEngagement}
            setShowLinkForm={setShowLinkEngagement}
          />

          {/* ── Linked Projects card ── */}
          <LinkedProjectsCard
            partnerId={partner.id}
            linkedProjects={localLinkedProjects}
            onRemoved={(linkId) => setLocalLinkedProjects((prev) => prev.filter((l) => l.linkId !== linkId))}
            showLinkForm={showLinkProject}
            setShowLinkForm={setShowLinkProject}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4" style={{ flex: "0.8" }}>

          {/* ── Contacts card ── */}
          <ContactsCard
            partnerId={partner.id}
            contacts={localContacts}
            onAdded={(c) => setLocalContacts((prev) => [...prev, c])}
            onRemoved={(id) => setLocalContacts((prev) => prev.filter((c) => c.id !== id))}
            showAddForm={showAddContact}
            setShowAddForm={setShowAddContact}
          />

          {/* ── Activity Timeline card ── */}
          <TimelineCard
            partnerId={partner.id}
            timeline={localTimeline}
            onAdded={(entry) => setLocalTimeline((prev) => [entry, ...prev])}
            showLogForm={showLogInteraction}
            setShowLogForm={setShowLogInteraction}
          />
        </div>
      </div>
    </div>
  );
}

// ── Linked Engagements Card ──────────────────────────────

function LinkedEngagementsCard({
  partnerId,
  linkedEngagements,
  allEngagements,
  onAdded,
  onRemoved,
  showLinkForm,
  setShowLinkForm,
}: {
  partnerId: string;
  linkedEngagements: LinkedEngagement[];
  allEngagements: Engagement[];
  onAdded: (entry: LinkedEngagement) => void;
  onRemoved: (linkId: string) => void;
  showLinkForm: boolean;
  setShowLinkForm: (v: boolean) => void;
}) {
  const [engagementId, setEngagementId] = useState("");
  const [role, setRole] = useState("referrer");
  const [terms, setTerms] = useState("");
  const [, startTransition] = useTransition();

  const handleAdd = () => {
    if (!engagementId) return;
    const eng = allEngagements.find((e) => e.id === engagementId);
    if (!eng) return;

    const optimistic: LinkedEngagement = {
      linkId: `link-${Date.now()}`,
      role,
      terms: terms || null,
      engagementId,
      engagementName: eng.name,
      engagementStage: "",
      companyName: eng.companyName,
      createdAt: new Date(),
    };
    onAdded(optimistic);
    setShowLinkForm(false);
    setEngagementId("");
    setRole("referrer");
    setTerms("");

    const fd = new FormData();
    fd.set("partnerId", partnerId);
    fd.set("engagementId", engagementId);
    fd.set("role", role);
    fd.set("terms", terms);
    startTransition(async () => {
      try {
        await createPartnerLink(fd);
        toast.success("Link created");
      } catch {
        toast.error("Failed to create link");
      }
    });
  };

  const handleRemove = (linkId: string) => {
    onRemoved(linkId);
    startTransition(async () => {
      try {
        await deletePartnerLink(linkId);
        toast.success("Link removed");
      } catch {
        toast.error("Failed to remove link");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <SectionHeader
        title="Linked Engagements"
        action={
          <button
            onClick={() => setShowLinkForm(!showLinkForm)}
            className="flex items-center gap-1 rounded-md bg-[#e8f0fe] px-2 py-1 text-[11px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc] transition-colors"
          >
            <Plus size={11} /> Link
          </button>
        }
      />

      {showLinkForm && (
        <div className="mb-3 rounded-lg border border-[#1a73e8] bg-white p-3 space-y-2">
          <select
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8] bg-white"
          >
            <option value="">Select engagement...</option>
            {allEngagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.companyName}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8] bg-white"
          >
            {Object.entries(PARTNER_LINK_ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Terms (optional)"
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowLinkForm(false)} className="text-[12px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!engagementId}
              className="rounded-md bg-[#1a73e8] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-50"
            >
              Link
            </button>
          </div>
        </div>
      )}

      {linkedEngagements.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No linked engagements.</p>
      ) : (
        <div className="space-y-2">
          {linkedEngagements.map((link) => (
            <div key={link.linkId} className="flex items-start justify-between gap-2 py-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/clients/${link.engagementId}`}
                    className="text-[13px] font-medium hover:text-[#1a73e8] hover:underline truncate"
                  >
                    {link.engagementName}
                  </Link>
                  {link.engagementStage && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_COLORS[link.engagementStage] ?? "bg-muted text-muted-foreground"}`}>
                      {link.engagementStage.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Building2 size={10} className="text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">{link.companyName}</span>
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground capitalize">
                    {PARTNER_LINK_ROLE_LABELS[link.role] ?? link.role}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRemove(link.linkId)}
                className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors mt-0.5"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Linked Projects Card ─────────────────────────────────

function LinkedProjectsCard({
  partnerId,
  linkedProjects,
  onRemoved,
  showLinkForm,
  setShowLinkForm,
}: {
  partnerId: string;
  linkedProjects: LinkedProject[];
  onRemoved: (linkId: string) => void;
  showLinkForm: boolean;
  setShowLinkForm: (v: boolean) => void;
}) {
  const [, startTransition] = useTransition();

  // Suppress unused variable warning — partnerId used when form is wired
  void partnerId;

  const handleRemove = (linkId: string) => {
    onRemoved(linkId);
    startTransition(async () => {
      try {
        await deletePartnerLink(linkId);
        toast.success("Link removed");
      } catch {
        toast.error("Failed to remove link");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <SectionHeader
        title="Linked Projects"
        action={
          <button
            onClick={() => setShowLinkForm(!showLinkForm)}
            className="flex items-center gap-1 rounded-md bg-[#e8f0fe] px-2 py-1 text-[11px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc] transition-colors"
          >
            <Plus size={11} /> Link
          </button>
        }
      />

      {showLinkForm && (
        <div className="mb-3 rounded-lg border border-dashed border-border p-3 text-[13px] text-muted-foreground">
          Project linking will be available once project data is loaded.
          <button onClick={() => setShowLinkForm(false)} className="ml-2 text-[#1a73e8] hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {linkedProjects.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No linked projects.</p>
      ) : (
        <div className="space-y-2">
          {linkedProjects.map((link) => (
            <div key={link.linkId} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{link.projectName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground capitalize">
                    {PARTNER_LINK_ROLE_LABELS[link.role] ?? link.role}
                  </span>
                  {link.projectStatus && (
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {link.projectStatus.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemove(link.linkId)}
                className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contacts Card ────────────────────────────────────────

function ContactsCard({
  partnerId,
  contacts,
  onAdded,
  onRemoved,
  showAddForm,
  setShowAddForm,
}: {
  partnerId: string;
  contacts: PartnerContact[];
  onAdded: (c: PartnerContact) => void;
  onRemoved: (id: string) => void;
  showAddForm: boolean;
  setShowAddForm: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [, startTransition] = useTransition();

  const handleAdd = () => {
    if (!name.trim()) return;
    const optimistic: PartnerContact = {
      id: `contact-${Date.now()}`,
      partnerId,
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      role: role || null,
      linkedinUrl: null,
      createdAt: new Date(),
    };
    onAdded(optimistic);
    setShowAddForm(false);
    setName(""); setEmail(""); setPhone(""); setRole("");

    const fd = new FormData();
    fd.set("partnerId", partnerId);
    fd.set("name", name.trim());
    fd.set("email", email);
    fd.set("phone", phone);
    fd.set("role", role);
    startTransition(async () => {
      try {
        await createPartnerContact(fd);
        toast.success("Contact added");
      } catch {
        toast.error("Failed to add contact");
      }
    });
  };

  const handleRemove = (contactId: string) => {
    onRemoved(contactId);
    startTransition(async () => {
      try {
        await deletePartnerContact(contactId);
        toast.success("Contact removed");
      } catch {
        toast.error("Failed to remove contact");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <SectionHeader
        title="Contacts"
        action={
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 rounded-md bg-[#e8f0fe] px-2 py-1 text-[11px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc] transition-colors"
          >
            <Plus size={11} /> Add
          </button>
        }
      />

      {showAddForm && (
        <div className="mb-3 rounded-lg border border-[#1a73e8] bg-white p-3 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name *"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAddForm(false); }}
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          />
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          />
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className="w-full rounded border border-border px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)} className="text-[12px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!name.trim()}
              className="rounded-md bg-[#1a73e8] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !showAddForm ? (
        <p className="text-[13px] text-muted-foreground">No contacts yet.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div key={contact.id} className="group flex items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/50">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium">{contact.name}</p>
                  {contact.role && (
                    <span className="text-[11px] text-muted-foreground">· {contact.role}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-2">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-1 text-[11px] text-[#1a73e8] hover:underline"
                    >
                      <Mail size={9} /> {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone size={9} /> {contact.phone}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemove(contact.id)}
                className="mt-0.5 shrink-0 text-transparent group-hover:text-muted-foreground hover:!text-red-500 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Timeline Card ────────────────────────────────────────

const INTERACTION_COLORS: Record<string, string> = {
  note: "#1a73e8",
  meeting: "#27ae60",
  call: "#f39c12",
  email: "#8e24aa",
  stage_change: "#e0e0e0",
};

function TimelineCard({
  partnerId,
  timeline,
  onAdded,
  showLogForm,
  setShowLogForm,
}: {
  partnerId: string;
  timeline: TimelineEntry[];
  onAdded: (entry: TimelineEntry) => void;
  showLogForm: boolean;
  setShowLogForm: (v: boolean) => void;
}) {
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (showLogForm) textRef.current?.focus();
  }, [showLogForm]);

  const handleLog = () => {
    if (!content.trim()) return;
    const optimistic: TimelineEntry = {
      id: `tl-${Date.now()}`,
      type,
      content: content.trim(),
      createdAt: new Date(),
      authorName: "You",
    };
    onAdded(optimistic);
    setShowLogForm(false);
    setContent("");

    const fd = new FormData();
    fd.set("partnerId", partnerId);
    fd.set("type", type);
    fd.set("content", content.trim());
    startTransition(async () => {
      try {
        await createPartnerInteraction(fd);
        toast.success("Logged");
      } catch {
        toast.error("Failed to log interaction");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <SectionHeader
        title="Activity"
        action={
          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="flex items-center gap-1 rounded-md bg-[#e8f0fe] px-2 py-1 text-[11px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc] transition-colors"
          >
            <Plus size={11} /> Log
          </button>
        }
      />

      {showLogForm && (
        <div className="mb-4 rounded-lg border border-[#1a73e8] bg-white p-3">
          <div className="mb-2 flex gap-1">
            {["note", "meeting", "call", "email"].map((t) => (
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
            ref={textRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleLog(); }
              if (e.key === "Escape") setShowLogForm(false);
            }}
            placeholder="What happened?"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setShowLogForm(false)} className="text-[12px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleLog}
              disabled={!content.trim()}
              className="rounded-md bg-[#1a73e8] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-50"
            >
              Log
            </button>
          </div>
        </div>
      )}

      {timeline.length === 0 && !showLogForm ? (
        <p className="text-[13px] text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="relative pl-5">
          {/* Left border line */}
          <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
          <div className="space-y-4">
            {timeline.map((entry) => {
              const dotColor = INTERACTION_COLORS[entry.type] ?? "#e0e0e0";
              return (
                <div key={entry.id} className="relative">
                  {/* Dot */}
                  <div
                    className="absolute -left-[13px] top-1 h-3 w-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: dotColor }}
                  />
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground capitalize">{entry.type.replace("_", " ")}</span>
                    <span>·</span>
                    <span>{entry.authorName}</span>
                    <span>·</span>
                    <span>
                      {new Date(entry.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-foreground">
                    {entry.content}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
