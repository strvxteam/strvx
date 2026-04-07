"use client";

import { useState, useTransition, useCallback } from "react";
import {
  createProspect,
  deleteProspect,
  changeProspectStage,
  convertProspect,
  updateProspect,
} from "@/app/actions";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Download,
  Phone,
  Mail,
  Link2 as LinkedinIcon,
  ExternalLink,
  Trash2,
  Loader2,
  Users,
  X,
  Check,
  ArrowRight,
  Pencil,
} from "lucide-react";
import type { ApolloPersonResult } from "@/app/api/apollo/search/route";

// ── Types ────────────────────────────────────────────

export interface SerializedProspect {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  industrySlug: string;
  stage: "cold" | "warm" | "hot" | "converted" | "lost";
  linkedinUrl: string;
  lastTouch: string | null;
  channel: string;
  touchCount: number;
  notes: string;
}

export interface SerializedIndustry {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

interface OutreachPageProps {
  initialProspects: SerializedProspect[];
  initialIndustries: SerializedIndustry[];
}

const STAGE_CONFIG = {
  cold: { label: "New", color: "bg-[#f0f0f0] text-[#666]" },
  warm: { label: "Contacted", color: "bg-[#e8f0fe] text-[#1a73e8]" },
  hot: { label: "Interested", color: "bg-[#fff3e0] text-[#e65100]" },
  converted: { label: "Converted", color: "bg-[#e6f9e6] text-[#2e7d32]" },
  lost: { label: "Not Interested", color: "bg-[#fce4ec] text-[#c62828]" },
} as const;

type StageKey = keyof typeof STAGE_CONFIG;

// ── Add Lead Form ────────────────────────────────────

function AddLeadForm({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company: string;
    title: string;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !company.trim()) return;
    onSave({ firstName, lastName, email, phone, company, title });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg border border-[#1a73e8] bg-white p-4"
    >
      <div className="grid grid-cols-3 gap-3">
        <input
          autoFocus
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name *"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name *"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company *"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] text-[#888] hover:bg-[#f5f5f5]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !firstName.trim() || !lastName.trim() || !company.trim()}
          className="flex items-center gap-1.5 rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add Lead
        </button>
      </div>
    </form>
  );
}

// ── Apollo Import Modal ──────────────────────────────

function ApolloImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (people: ApolloPersonResult[]) => void;
}) {
  const [titles, setTitles] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<ApolloPersonResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apolloConfigured, setApolloConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);

  // Check if Apollo is configured
  useState(() => {
    fetch("/api/apollo/status")
      .then((r) => r.json())
      .then((d) => setApolloConfigured(d.configured))
      .catch(() => setApolloConfigured(false));
  });

  async function handleSearch() {
    if (!titles.trim() && !companyName.trim() && !location.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personTitles: titles
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          companyName: companyName.trim() || undefined,
          location: location.trim() || undefined,
          perPage: 25,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Search failed");
      }
      const data = await res.json();
      setResults(data.people || []);
      setTotalResults(data.totalResults || 0);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((p) => p.id)));
    }
  }

  async function handleImport() {
    const toImport = results.filter((p) => selected.has(p.id));
    if (toImport.length === 0) return;
    setImporting(true);
    onImport(toImport);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-6 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#222]">Import from Apollo</h2>
            <p className="text-[12px] text-[#888]">
              Search for leads and import them into your database
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#aaa] hover:bg-[#f5f5f5]">
            <X size={18} />
          </button>
        </div>

        {apolloConfigured === false ? (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <Users size={36} strokeWidth={1} className="mb-3 text-[#ccc]" />
            <p className="text-[14px] font-medium text-[#888]">Apollo not configured</p>
            <p className="mt-1 max-w-sm text-center text-[12px] text-[#bbb]">
              Add your Apollo API key as <code className="rounded bg-[#f5f5f5] px-1.5 py-0.5 text-[#666]">APOLLO_API_KEY</code> in
              your environment variables, then restart the server.
            </p>
          </div>
        ) : (
          <>
            {/* Search form */}
            <div className="border-b border-[#f0f0f0] px-6 py-4">
              <div className="flex gap-3">
                <input
                  value={titles}
                  onChange={(e) => setTitles(e.target.value)}
                  placeholder="Job titles (comma separated)"
                  className="flex-1 rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
                />
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                  className="w-48 rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
                />
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location"
                  className="w-36 rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="flex items-center gap-1.5 rounded-md bg-[#111] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-50"
                >
                  {searching ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  Search
                </button>
              </div>
              {error && <p className="mt-2 text-[12px] text-[#ef4444]">{error}</p>}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-auto">
              {results.length > 0 ? (
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-[#fafafa] text-left text-[11px] font-semibold uppercase tracking-wide text-[#999]">
                    <tr>
                      <th className="px-6 py-2">
                        <input
                          type="checkbox"
                          checked={selected.size === results.length && results.length > 0}
                          onChange={toggleAll}
                          className="accent-[#1a73e8]"
                        />
                      </th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Company</th>
                      <th className="py-2">Title</th>
                      <th className="py-2">Email</th>
                      <th className="py-2 pr-6">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((person) => (
                      <tr
                        key={person.id}
                        onClick={() => toggleSelect(person.id)}
                        className="cursor-pointer border-t border-[#f5f5f5] hover:bg-[#fafafa]"
                      >
                        <td className="px-6 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(person.id)}
                            onChange={() => toggleSelect(person.id)}
                            className="accent-[#1a73e8]"
                          />
                        </td>
                        <td className="py-2.5 font-medium text-[#222]">
                          {person.firstName} {person.lastName}
                        </td>
                        <td className="py-2.5 text-[#555]">{person.company || "—"}</td>
                        <td className="py-2.5 text-[#555]">{person.title || "—"}</td>
                        <td className="py-2.5 text-[#555]">{person.email || "—"}</td>
                        <td className="py-2.5 pr-6 text-[#555]">{person.phone || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : !searching ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#aaa]">
                  <Search size={28} strokeWidth={1} className="mb-2" />
                  <p className="text-[13px]">
                    {totalResults > 0
                      ? "No results"
                      : "Search Apollo to find leads"}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            {results.length > 0 && (
              <div className="flex items-center justify-between border-t border-[#f0f0f0] px-6 py-3">
                <span className="text-[12px] text-[#888]">
                  {totalResults.toLocaleString()} results found — showing {results.length}
                </span>
                <button
                  onClick={handleImport}
                  disabled={selected.size === 0 || importing}
                  className="flex items-center gap-1.5 rounded-md bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-40"
                >
                  {importing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Import {selected.size} lead{selected.size !== 1 ? "s" : ""}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────

export default function OutreachPage({
  initialProspects,
}: OutreachPageProps) {
  const [leads, setLeads] = useState<SerializedProspect[]>(initialProspects);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | StageKey>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showApollo, setShowApollo] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    title: "",
  });

  const filtered = leads.filter((l) => {
    if (stageFilter !== "all" && l.stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        l.firstName.toLowerCase().includes(q) ||
        l.lastName.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;

  // ── Handlers ─────────────────────────────────────

  const handleAddLead = useCallback(
    (data: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      company: string;
      title: string;
    }) => {
      startTransition(async () => {
        try {
          const prospect = await createProspect({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email || undefined,
            phone: data.phone || undefined,
            companyName: data.company,
            title: data.title || undefined,
          });
          setLeads((prev) => [
            ...prev,
            {
              id: prospect.id,
              firstName: prospect.firstName,
              lastName: prospect.lastName,
              email: prospect.email ?? "",
              phone: prospect.phone ?? "",
              company: prospect.companyName,
              title: prospect.title ?? "",
              industrySlug: prospect.industrySlug ?? "",
              stage: prospect.stage as StageKey,
              linkedinUrl: prospect.linkedinUrl ?? "",
              lastTouch: null,
              channel: "",
              touchCount: 0,
              notes: prospect.notes ?? "",
            },
          ]);
          setShowAdd(false);
          toast.success("Lead added");
        } catch (err) {
          console.error("Failed to add lead:", err);
          toast.error("Failed to add lead");
        }
      });
    },
    [],
  );

  function handleApolloImport(people: ApolloPersonResult[]) {
    startTransition(async () => {
      try {
        for (const person of people) {
          const prospect = await createProspect({
            firstName: person.firstName,
            lastName: person.lastName,
            email: person.email || undefined,
            phone: person.phone || undefined,
            companyName: person.company || "Unknown",
            title: person.title || undefined,
            linkedinUrl: person.linkedinUrl || undefined,
            source: "apollo",
            apolloContactId: person.id,
          });
          setLeads((prev) => [
            ...prev,
            {
              id: prospect.id,
              firstName: prospect.firstName,
              lastName: prospect.lastName,
              email: prospect.email ?? "",
              phone: prospect.phone ?? "",
              company: prospect.companyName,
              title: prospect.title ?? "",
              industrySlug: prospect.industrySlug ?? "",
              stage: prospect.stage as StageKey,
              linkedinUrl: prospect.linkedinUrl ?? "",
              lastTouch: null,
              channel: "",
              touchCount: 0,
              notes: "",
            },
          ]);
        }
        setShowApollo(false);
        toast.success(`Imported ${people.length} lead${people.length !== 1 ? "s" : ""}`);
      } catch (err) {
        console.error("Failed to import leads:", err);
        toast.error("Failed to import leads");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteProspect(id);
        setLeads((prev) => prev.filter((l) => l.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setEditing(false);
        }
        toast.success("Lead deleted");
      } catch (err) {
        console.error("Failed to delete lead:", err);
        toast.error("Failed to delete lead");
      }
    });
  }

  function handleStageChange(id: string, stage: StageKey) {
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
    startTransition(async () => {
      try {
        if (stage === "converted") {
          await convertProspect(id);
        } else {
          await changeProspectStage(id, stage);
        }
        toast.success("Stage updated");
      } catch {
        toast.error("Failed to update stage");
        // Revert
        setLeads((prev) =>
          prev.map((l) => {
            const original = initialProspects.find((ip) => ip.id === l.id);
            return l.id === id && original ? { ...l, stage: original.stage } : l;
          }),
        );
      }
    });
  }

  function startEditing(lead: SerializedProspect) {
    setEditForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      title: lead.title,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function handleSaveEdit() {
    if (!selectedLead) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.company.trim()) {
      toast.error("First name, last name, and company are required");
      return;
    }

    const prev = { ...selectedLead };

    // Optimistic update
    setLeads((cur) =>
      cur.map((l) =>
        l.id === selectedLead.id
          ? {
              ...l,
              firstName: editForm.firstName.trim(),
              lastName: editForm.lastName.trim(),
              email: editForm.email.trim(),
              phone: editForm.phone.trim(),
              company: editForm.company.trim(),
              title: editForm.title.trim(),
            }
          : l,
      ),
    );
    setEditing(false);

    startTransition(async () => {
      try {
        await updateProspect(selectedLead.id, {
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          email: editForm.email.trim() || undefined,
          phone: editForm.phone.trim() || undefined,
          companyName: editForm.company.trim(),
          title: editForm.title.trim() || undefined,
        });
        toast.success("Lead updated");
      } catch {
        // Revert
        setLeads((cur) =>
          cur.map((l) =>
            l.id === prev.id
              ? {
                  ...l,
                  firstName: prev.firstName,
                  lastName: prev.lastName,
                  email: prev.email,
                  phone: prev.phone,
                  company: prev.company,
                  title: prev.title,
                }
              : l,
          ),
        );
        toast.error("Failed to update lead");
      }
    });
  }

  // ── Render ───────────────────────────────────────

  const stageCounts = leads.reduce(
    (acc, l) => {
      acc[l.stage] = (acc[l.stage] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="mb-5 shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Leads{" "}
          <span className="text-[14px] font-normal text-[#888]">({leads.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowApollo(true);
              setShowAdd(false);
            }}
            className="flex items-center gap-1.5 rounded-md border border-[#e0e0e0] px-3 py-1.5 text-[13px] font-medium text-[#555] transition-colors hover:bg-[#f5f5f5]"
          >
            <Download size={14} />
            Import from Apollo
          </button>
          <button
            onClick={() => {
              setShowAdd(true);
              setShowApollo(false);
            }}
            className="flex items-center gap-1.5 rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
          >
            <Plus size={14} />
            Add Lead
          </button>
        </div>
      </div>

      {/* Funnel metrics */}
      {(() => {
        const funnelStages = [
          { key: "cold" as const, label: "New", color: "bg-[#e0e0e0]", textColor: "text-[#666]" },
          { key: "warm" as const, label: "Contacted", color: "bg-[#1a73e8]", textColor: "text-[#1a73e8]" },
          { key: "hot" as const, label: "Interested", color: "bg-[#e65100]", textColor: "text-[#e65100]" },
          { key: "converted" as const, label: "Converted", color: "bg-[#27ae60]", textColor: "text-[#27ae60]" },
        ];
        const stageCounts = funnelStages.map((s) => ({
          ...s,
          count: leads.filter((l) => l.stage === s.key).length,
        }));
        const total = stageCounts.reduce((sum, s) => sum + s.count, 0);
        const lostCount = leads.filter((l) => l.stage === "lost").length;

        return total > 0 ? (
          <div className="mb-4 shrink-0 rounded-lg border border-[#e0e0e0] bg-white p-3">
            <div className="mb-2 flex h-2.5 overflow-hidden rounded-full">
              {stageCounts.filter((s) => s.count > 0).map((s) => (
                <div key={s.key} className={`${s.color} transition-all`}
                  style={{ width: `${(s.count / total) * 100}%` }} />
              ))}
            </div>
            <div className="flex items-center gap-5">
              {stageCounts.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${s.color}`} />
                  <span className="text-[11px] text-[#555]">{s.label}</span>
                  <span className={`text-[12px] font-semibold ${s.textColor}`}>{s.count}</span>
                </div>
              ))}
              {lostCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-[#c62828]" />
                  <span className="text-[11px] text-[#555]">Lost</span>
                  <span className="text-[12px] font-semibold text-[#c62828]">{lostCount}</span>
                </div>
              )}
              {total > 0 && stageCounts.find((s) => s.key === "converted")!.count > 0 && (
                <span className="ml-auto text-[11px] font-medium text-[#27ae60]">
                  {Math.round((stageCounts.find((s) => s.key === "converted")!.count / total) * 100)}% conversion
                </span>
              )}
            </div>
          </div>
        ) : null;
      })()}

      {/* Search + stage filters */}
      <div className="mb-4 shrink-0 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, or email..."
            className="w-full rounded-lg border border-[#e0e0e0] bg-[#fafafa] py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#1a73e8] focus:bg-white"
          />
        </div>
        <div className="flex rounded-lg border border-[#e0e0e0]">
          {(
            [
              ["all", "All", leads.length],
              ["cold", "New", stageCounts.cold || 0],
              ["warm", "Contacted", stageCounts.warm || 0],
              ["hot", "Interested", stageCounts.hot || 0],
              ["converted", "Converted", stageCounts.converted || 0],
              ["lost", "Passed", stageCounts.lost || 0],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setStageFilter(key)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                stageFilter === key
                  ? "bg-[#f0f0f0] text-[#111]"
                  : "text-[#888] hover:text-[#555]"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <AddLeadForm
          onSave={handleAddLead}
          onCancel={() => setShowAdd(false)}
          saving={isPending}
        />
      )}

      {/* Main layout: table + detail panel */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Leads table */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_140px_120px_100px_40px] gap-2 border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#999]">
            <span>Name</span>
            <span>Company</span>
            <span>Title</span>
            <span>Contact</span>
            <span>Status</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-[#aaa]">
              <Users size={32} strokeWidth={1} className="mb-2" />
              <p className="text-[13px]">
                {leads.length === 0
                  ? "No leads yet — add one or import from Apollo"
                  : "No leads match your filters"}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              {filtered.map((lead) => {
                const stage = STAGE_CONFIG[lead.stage];
                const isSelected = selectedId === lead.id;

                return (
                  <div
                    key={lead.id}
                    onClick={() => {
                      setSelectedId(isSelected ? null : lead.id);
                      setEditing(false);
                    }}
                    className={`grid cursor-pointer grid-cols-[1fr_140px_140px_120px_100px_40px] items-center gap-2 border-b border-[#f5f5f5] px-4 py-2.5 transition-colors hover:bg-[#fafafa] ${
                      isSelected ? "bg-[#f0f7ff]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[11px] font-semibold text-[#888]">
                        {lead.firstName[0]}
                        {lead.lastName[0]}
                      </div>
                      <span className="truncate text-[13px] font-medium text-[#222]">
                        {lead.firstName} {lead.lastName}
                      </span>
                    </div>
                    <span className="truncate text-[12px] text-[#555]">
                      {lead.company}
                    </span>
                    <span className="truncate text-[12px] text-[#888]">
                      {lead.title || "—"}
                    </span>
                    <div className="flex items-center gap-2">
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#aaa] hover:text-[#1a73e8]"
                          title={lead.email}
                        >
                          <Mail size={13} />
                        </a>
                      )}
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#aaa] hover:text-[#1a73e8]"
                          title={lead.phone}
                        >
                          <Phone size={13} />
                        </a>
                      )}
                      {lead.linkedinUrl && (
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#aaa] hover:text-[#0077b5]"
                          title="LinkedIn"
                        >
                          <LinkedinIcon size={13} />
                        </a>
                      )}
                    </div>
                    <span
                      className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.color}`}
                    >
                      {stage.label}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(lead.id);
                      }}
                      className="rounded p-1 text-[#ccc] opacity-0 transition-all hover:text-[#ef4444] group-hover:opacity-100 [div:hover>&]:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedLead && (
          <div className="w-80 shrink-0 overflow-auto rounded-lg border border-[#e0e0e0] bg-white">
            {/* Header */}
            <div className="border-b border-[#f0f0f0] p-4">
              <div className="flex items-start justify-between">
                {editing ? (
                  <div className="flex-1 pr-2">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={editForm.firstName}
                        onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                        placeholder="First name *"
                        className="w-full rounded-md border border-[#e0e0e0] px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                      />
                      <input
                        value={editForm.lastName}
                        onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                        placeholder="Last name *"
                        className="w-full rounded-md border border-[#e0e0e0] px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                      />
                    </div>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Title"
                      className="mt-2 w-full rounded-md border border-[#e0e0e0] px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                    />
                    <input
                      value={editForm.company}
                      onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder="Company *"
                      className="mt-2 w-full rounded-md border border-[#e0e0e0] px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                ) : (
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#222]">
                      {selectedLead.firstName} {selectedLead.lastName}
                    </h2>
                    <p className="text-[12px] text-[#888]">
                      {selectedLead.title ? `${selectedLead.title} at ` : ""}
                      {selectedLead.company}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {!editing && (
                    <button
                      onClick={() => startEditing(selectedLead)}
                      className="rounded p-1 text-[#aaa] hover:bg-[#f5f5f5] hover:text-[#555]"
                      title="Edit lead"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setEditing(false);
                    }}
                    className="rounded p-1 text-[#aaa] hover:bg-[#f5f5f5]"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="border-b border-[#f0f0f0] p-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#aaa]">
                Contact
              </h3>
              {editing ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="shrink-0 text-[#aaa]" />
                    <input
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Email"
                      className="w-full rounded-md border border-[#e0e0e0] px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="shrink-0 text-[#aaa]" />
                    <input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Phone"
                      className="w-full rounded-md border border-[#e0e0e0] px-2 py-1 text-[13px] outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedLead.email && (
                    <a
                      href={`mailto:${selectedLead.email}`}
                      className="flex items-center gap-2 text-[13px] text-[#555] hover:text-[#1a73e8]"
                    >
                      <Mail size={13} className="shrink-0 text-[#aaa]" />
                      {selectedLead.email}
                    </a>
                  )}
                  {selectedLead.phone && (
                    <a
                      href={`tel:${selectedLead.phone}`}
                      className="flex items-center gap-2 text-[13px] text-[#555] hover:text-[#1a73e8]"
                    >
                      <Phone size={13} className="shrink-0 text-[#aaa]" />
                      {selectedLead.phone}
                    </a>
                  )}
                  {selectedLead.linkedinUrl && (
                    <a
                      href={selectedLead.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[13px] text-[#555] hover:text-[#0077b5]"
                    >
                      <LinkedinIcon size={13} className="shrink-0 text-[#aaa]" />
                      LinkedIn
                      <ExternalLink size={11} className="text-[#ccc]" />
                    </a>
                  )}
                  {!selectedLead.email && !selectedLead.phone && !selectedLead.linkedinUrl && (
                    <p className="text-[12px] text-[#bbb]">No contact info</p>
                  )}
                </div>
              )}
            </div>

            {/* Edit actions (Save / Cancel) */}
            {editing && (
              <div className="flex items-center gap-2 border-b border-[#f0f0f0] p-4">
                <button
                  onClick={handleSaveEdit}
                  disabled={isPending}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#333] disabled:opacity-40"
                >
                  {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Save
                </button>
                <button
                  onClick={cancelEditing}
                  className="flex-1 rounded-md px-3 py-1.5 text-[13px] text-[#888] hover:bg-[#f5f5f5]"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Stage selector */}
            <div className="border-b border-[#f0f0f0] p-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#aaa]">
                Status
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(STAGE_CONFIG) as [StageKey, (typeof STAGE_CONFIG)[StageKey]][]).map(
                  ([key, config]) => (
                    <button
                      key={key}
                      onClick={() => handleStageChange(selectedLead.id, key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        selectedLead.stage === key
                          ? config.color
                          : "bg-[#f5f5f5] text-[#999] hover:bg-[#eee]"
                      }`}
                    >
                      {config.label}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-4">
              {selectedLead.stage !== "converted" && (
                <button
                  onClick={() => handleStageChange(selectedLead.id, "converted")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#2e7d32] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1b5e20]"
                >
                  <ArrowRight size={14} />
                  Convert to Client
                </button>
              )}
              {selectedLead.stage === "converted" && (
                <div className="flex items-center gap-2 rounded-md bg-[#e6f9e6] px-3 py-2 text-[13px] font-medium text-[#2e7d32]">
                  <Check size={14} />
                  Converted to client
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Apollo modal */}
      {showApollo && (
        <ApolloImportModal
          onClose={() => setShowApollo(false)}
          onImport={handleApolloImport}
        />
      )}
    </div>
  );
}
