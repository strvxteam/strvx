import type { getEngagement } from "@/lib/queries";
import { BriefCard } from "@/components/kg/brief-card";

type Engagement = Awaited<ReturnType<typeof getEngagement>>;

export function EngagementOverview({ engagement }: { engagement: Engagement }) {
  if (!engagement) return null;
  return (
    <div>
      <BriefCard entityId={`postgres:engagements:${engagement.id}`} compact />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Company" value={engagement.companyName} />
        <Field label="Engagement" value={engagement.name} />
        <Field label="Stage" value={engagement.stage} />
        <Field
          label="Deal value"
          value={
            engagement.dealValue
              ? `$${Number(engagement.dealValue).toLocaleString()}`
              : null
          }
        />
        <Field
          label="Probability"
          value={engagement.probability ? `${engagement.probability}%` : null}
        />
        <Field label="Expected close" value={engagement.expectedCloseDate} />
        <Field label="Primary contact" value={engagement.contactName} />
        <Field label="Contact email" value={engagement.contactEmail} />
        <Field label="Industry" value={engagement.companyIndustry} />
        <Field label="Source" value={engagement.source} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[#888]">{label}</div>
      <div className="text-[13px] text-[#222]">{value ?? "—"}</div>
    </div>
  );
}
