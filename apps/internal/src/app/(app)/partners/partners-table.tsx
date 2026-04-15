"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import {
  PARTNER_STAGE_LABELS,
  PARTNER_STAGE_COLORS,
  PARTNER_TAG_COLORS,
} from "@/lib/partner-constants";
import { createPartner } from "@/app/actions";

// ── Types ────────────────────────────────────────────────────────────────────

type Partner = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  stage: string;
  tags: string[] | null;
  commissionRate: string | null;
  hourlyRate: string | null;
  createdAt: Date | string;
  linkedEngagementCount: number;
  outstandingBalance: number;
};

interface PartnersTableProps {
  initialPartners: Partner[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ── Tag Badge ─────────────────────────────────────────────────────────────────

function TagBadge({ tag }: { tag: string }) {
  const colors = PARTNER_TAG_COLORS[tag] ?? { bg: "bg-[#f1f5f9]", text: "text-[#64748b]" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${colors.bg} ${colors.text}`}
    >
      {tag}
    </span>
  );
}

// ── Stage Badge ───────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const color = PARTNER_STAGE_COLORS[stage] ?? "bg-[#f1f5f9] text-[#64748b]";
  const label = PARTNER_STAGE_LABELS[stage] ?? stage;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {label}
    </span>
  );
}

// ── Create Partner Modal ───────────────────────────────────────────────────────

const TAGS = ["referral", "service", "strategic"] as const;
const STAGES = ["prospective", "onboarding", "active", "on_hold", "churned"] as const;

function CreatePartnerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Append selected tags (checkboxes not checked won't appear in FormData)
    data.delete("tags");
    for (const tag of selectedTags) {
      data.append("tags", tag);
    }

    startTransition(async () => {
      try {
        await createPartner(data);
        toast.success("Partner created");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create partner");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl rounded-[6px] border border-[#e0e0e0] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e0e0e0] px-4 py-3">
          <span className="text-[13px] font-semibold text-[#111]">New Partner</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#888] hover:bg-[#f5f5f5] hover:text-[#111]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Name <span className="text-[#e74c3c]">*</span>
              </label>
              <input
                name="name"
                required
                autoFocus
                placeholder="Full name"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Company */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Company
              </label>
              <input
                name="company"
                placeholder="Company name"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Email
              </label>
              <input
                name="email"
                type="email"
                placeholder="email@example.com"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Phone
              </label>
              <input
                name="phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Website */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Website
              </label>
              <input
                name="website"
                placeholder="https://example.com"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* LinkedIn */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                LinkedIn
              </label>
              <input
                name="linkedinUrl"
                placeholder="https://linkedin.com/in/..."
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Stage */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Stage
              </label>
              <select
                name="stage"
                defaultValue="prospective"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none focus:border-[#1a73e8] disabled:opacity-50"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {PARTNER_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Tags
              </label>
              <div className="flex gap-2">
                {TAGS.map((tag) => {
                  const active = selectedTags.has(tag);
                  const colors = PARTNER_TAG_COLORS[tag];
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      disabled={isPending}
                      className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-all disabled:opacity-50 ${
                        active
                          ? `${colors.bg} ${colors.text} ring-1 ring-current ring-offset-1`
                          : "bg-[#f5f5f5] text-[#888] hover:bg-[#ececec]"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Commission Rate */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Commission Rate (%)
              </label>
              <input
                name="commissionRate"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Hourly Rate */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Hourly Rate ($)
              </label>
              <input
                name="hourlyRate"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Flat Rate */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Flat Rate ($)
              </label>
              <input
                name="flatRate"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                disabled={isPending}
                className="w-full rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#888]">
                Notes
              </label>
              <textarea
                name="notes"
                rows={3}
                placeholder="Any additional notes..."
                disabled={isPending}
                className="w-full resize-none rounded-[6px] border border-[#e0e0e0] px-3 py-[10px] text-[14px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-[6px] px-3 py-1.5 text-[13px] text-[#888] hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-[6px] bg-[#e8f0fe] px-3 py-1.5 text-[13px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc] disabled:opacity-50"
            >
              {isPending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1a73e8] border-t-transparent" />
              ) : (
                <Plus size={13} />
              )}
              Create Partner
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Table ────────────────────────────────────────────────────────────────

type StageFilter = "all" | "prospective" | "onboarding" | "active" | "on_hold" | "churned";
type TagFilter = "all" | "referral" | "service" | "strategic";

export function PartnersTable({ initialPartners }: PartnersTableProps) {
  const router = useRouter();
  const [partners] = useState<Partner[]>(initialPartners);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [showModal, setShowModal] = useState(false);

  const filtered = partners.filter((p) => {
    if (stageFilter !== "all" && p.stage !== stageFilter) return false;
    if (tagFilter !== "all") {
      if (!p.tags || !p.tags.includes(tagFilter)) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = p.name.toLowerCase().includes(q);
      const companyMatch = p.company?.toLowerCase().includes(q) ?? false;
      if (!nameMatch && !companyMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-1 flex-col">
      {/* Header + Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#bbb]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or company..."
            className="w-full rounded-[6px] border border-[#e0e0e0] py-[7px] pl-8 pr-3 text-[13px] text-[#111] outline-none placeholder:text-[#bbb] focus:border-[#1a73e8]"
          />
        </div>

        {/* Stage filter */}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as StageFilter)}
          className="rounded-[6px] border border-[#e0e0e0] py-[7px] px-3 text-[13px] text-[#555] outline-none focus:border-[#1a73e8]"
        >
          <option value="all">All Stages</option>
          <option value="prospective">Prospective</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="churned">Churned</option>
        </select>

        {/* Tag filter */}
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value as TagFilter)}
          className="rounded-[6px] border border-[#e0e0e0] py-[7px] px-3 text-[13px] text-[#555] outline-none focus:border-[#1a73e8]"
        >
          <option value="all">All Tags</option>
          <option value="referral">Referral</option>
          <option value="service">Service</option>
          <option value="strategic">Strategic</option>
        </select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* New Partner button */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-[6px] bg-[#e8f0fe] px-3 py-[7px] text-[13px] font-medium text-[#1a73e8] hover:bg-[#d2e3fc]"
        >
          <Plus size={13} />
          New Partner
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 rounded-[6px] border border-[#e0e0e0] bg-white">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_80px_100px] border-b border-[#e0e0e0] px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Name</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Stage</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Tags</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Engagements</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-right text-[#888]">Outstanding</span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[#aaa]">
            {search || stageFilter !== "all" || tagFilter !== "all"
              ? "No partners match your filters."
              : "No partners yet. Add one to get started."}
          </div>
        ) : (
          filtered.map((partner) => (
            <div
              key={partner.id}
              onClick={() => router.push(`/partners/${partner.id}`)}
              className="grid cursor-pointer grid-cols-[2fr_1fr_1fr_80px_100px] items-center border-b border-[#e0e0e0] px-4 py-3 hover:bg-[#fafafa]"
            >
              {/* Name + company */}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[#111]">{partner.name}</p>
                {partner.company && (
                  <p className="truncate text-[11px] text-[#888]">{partner.company}</p>
                )}
              </div>

              {/* Stage */}
              <div>
                <StageBadge stage={partner.stage} />
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {partner.tags && partner.tags.length > 0 ? (
                  partner.tags.map((tag) => <TagBadge key={tag} tag={tag} />)
                ) : (
                  <span className="text-[11px] text-[#ccc]">—</span>
                )}
              </div>

              {/* Engagements count */}
              <div className="text-[13px] text-[#555]">
                {partner.linkedEngagementCount > 0 ? partner.linkedEngagementCount : (
                  <span className="text-[#ccc]">—</span>
                )}
              </div>

              {/* Outstanding balance */}
              <div className="text-right text-[13px] text-[#555]">
                {formatCurrency(partner.outstandingBalance)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Result count */}
      {filtered.length > 0 && (
        <p className="mt-2 text-[11px] text-[#aaa]">
          {filtered.length} partner{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== partners.length && ` of ${partners.length}`}
        </p>
      )}

      {/* Modal */}
      {showModal && <CreatePartnerModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
