"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { createPartnerLink, deletePartnerLink } from "@/app/actions";
import { PARTNER_LINK_ROLE_LABELS } from "@/lib/partner-constants";
import { toast } from "sonner";

type LinkedPartner = {
  linkId: string;
  role: string;
  terms: string | null;
  partnerId: string;
  partnerName: string;
  partnerCompany: string | null;
  commissionRate?: string | null;
};

type PartnerOption = {
  id: string;
  name: string;
  company: string | null;
};

export function PartnerLinkCard({
  linkedPartners,
  partnerOptions,
  engagementId,
  projectId,
}: {
  linkedPartners: LinkedPartner[];
  partnerOptions: PartnerOption[];
  engagementId?: string;
  projectId?: string;
}) {
  const [links, setLinks] = useState(linkedPartners);
  const [showForm, setShowForm] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [role, setRole] = useState("referrer");
  const [terms, setTerms] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  const handleAdd = () => {
    if (!partnerId) return;
    const partner = partnerOptions.find((p) => p.id === partnerId);
    if (!partner) return;

    const optimistic: LinkedPartner = {
      linkId: `link-${Date.now()}`,
      role,
      terms: terms || null,
      partnerId,
      partnerName: partner.name,
      partnerCompany: partner.company,
      commissionRate: null,
    };

    setLinks((prev) => [...prev, optimistic]);
    setShowForm(false);
    setPartnerId("");
    setRole("referrer");
    setTerms("");

    const fd = new FormData();
    fd.set("partnerId", partnerId);
    fd.set("role", role);
    fd.set("terms", terms);
    if (engagementId) fd.set("engagementId", engagementId);
    if (projectId) fd.set("projectId", projectId);

    startTransition(async () => {
      try {
        await createPartnerLink(fd);
        toast.success("Partner linked");
        router.refresh();
      } catch {
        toast.error("Failed to link partner");
        setLinks((prev) => prev.filter((l) => l.linkId !== optimistic.linkId));
      }
    });
  };

  const handleRemove = (linkId: string) => {
    setLinks((prev) => prev.filter((l) => l.linkId !== linkId));
    startTransition(async () => {
      try {
        await deletePartnerLink(linkId);
        toast.success("Partner unlinked");
        router.refresh();
      } catch {
        toast.error("Failed to remove link");
      }
    });
  };

  return (
    <div className="rounded-[6px] border border-[#e0e0e0] bg-white p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#aaa]">
          Partners
        </span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-[#e8f0fe] px-2 py-1 text-[11px] font-medium text-[#1a73e8] transition-colors hover:bg-[#d2e3fc]"
        >
          <Plus size={11} />
          Link
        </button>
      </div>

      {/* Inline add form */}
      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-[#1a73e8] bg-white p-3">
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="w-full rounded border border-[#e0e0e0] bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          >
            <option value="">Select partner...</option>
            {partnerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.company ? ` — ${p.company}` : ""}
              </option>
            ))}
          </select>

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-[#e0e0e0] bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          >
            {Object.entries(PARTNER_LINK_ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Terms (optional)"
            className="w-full rounded border border-[#e0e0e0] px-2 py-1.5 text-[13px] outline-none focus:border-[#1a73e8]"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="text-[12px] text-[#aaa] hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!partnerId}
              className="rounded-md bg-[#1a73e8] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#1557b0] disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Partner list */}
      {links.length === 0 ? (
        <p className="text-[13px] text-[#aaa]">No linked partners.</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.linkId}
              className="flex items-start justify-between gap-2 py-0.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/partners/${link.partnerId}`}
                    className="text-[13px] font-medium hover:text-[#1a73e8] hover:underline truncate"
                  >
                    {link.partnerName}
                  </Link>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                    {PARTNER_LINK_ROLE_LABELS[link.role] ?? link.role}
                  </span>
                </div>

                <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-[#aaa]">
                  {link.partnerCompany && (
                    <span>{link.partnerCompany}</span>
                  )}
                  {link.role === "referrer" && link.commissionRate && (
                    <span className="text-[#27ae60]">
                      {link.commissionRate}% commission
                    </span>
                  )}
                  {link.terms && (
                    <span className="italic">{link.terms}</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleRemove(link.linkId)}
                className="mt-0.5 shrink-0 text-[#ccc] transition-colors hover:text-red-500"
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
