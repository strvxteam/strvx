import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getContext, getNodeById } from "@/lib/kg/queries";
import { entityHref } from "../../helpers";
import { BriefCard } from "@/components/kg/brief-card";
import { TrustBar } from "./trust-bar";

export const dynamic = "force-dynamic";

interface EntityPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EntityPageProps): Promise<Metadata> {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const node = await getNodeById(decoded).catch(() => null);
  const name =
    (node?.properties as Record<string, unknown> | undefined)?.name ??
    (node?.properties as Record<string, unknown> | undefined)?.title ??
    decoded;
  return { title: `${String(name)} — KG` };
}

export default async function EntityPage({ params }: EntityPageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  let node: Awaited<ReturnType<typeof getNodeById>> = null;
  let context: Awaited<ReturnType<typeof getContext>> | null = null;
  let loadError: string | null = null;

  try {
    node = await getNodeById(id);
  } catch (err) {
    loadError = (err as Error).message;
  }

  // Distinguish "lookup threw" (show error card) from "no such id" (404).
  if (!node && !loadError) {
    notFound();
  }

  if (node) {
    try {
      context = await getContext(id, 2, 60);
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  const props = (node?.properties ?? {}) as Record<string, unknown>;
  const name =
    (props.name as string | undefined) ??
    (props.title as string | undefined) ??
    (typeof props.content === "string" ? (props.content as string).slice(0, 80) : undefined) ??
    node?.id ?? id;
  const summary = (props.summary as string | undefined) ?? null;

  // Provenance is a top-level Node field, not embedded in properties.
  const provFields = node?.provenance
    ? Object.entries(node.provenance as unknown as Record<string, unknown>)
    : [];
  const dataFields = Object.entries(props).filter(([k]) => k !== "id");

  return (
    <div>
      <Link
        href="/kg"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "#555",
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} /> Back to Knowledge Graph
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          {node ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <LabelChip label={node.type} />
            </div>
          ) : null}
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{name}</h1>
          <p
            style={{
              fontSize: 12,
              color: "#888",
              marginTop: 4,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              wordBreak: "break-all",
            }}
          >
            {node?.id ?? id}
          </p>
        </div>
      </div>

      {node?.provenance ? (() => {
        const prov = node.provenance as unknown as Record<string, unknown>;
        return (
          <TrustBar
            trustScore={prov.trust_score as number | undefined}
            confidence={prov.confidence as number | undefined}
            lastValidatedAt={prov.last_validated_at as string | undefined}
            extractionMethod={prov.extraction_method as string | undefined}
            createdBy={prov.created_by as string | undefined}
            validationCount={prov.validation_count as number | undefined}
          />
        );
      })() : null}

      {loadError ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            padding: "12px 14px",
            fontSize: 13,
            color: "#7f1d1d",
            marginBottom: 16,
          }}
        >
          Couldn&apos;t load related context: {loadError}
        </div>
      ) : null}

      {summary ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #e0e0e0",
            background: "#fff",
            padding: 20,
            marginBottom: 16,
            fontSize: 14,
            lineHeight: 1.6,
            color: "#222",
          }}
        >
          {summary}
        </div>
      ) : null}

      {node ? <BriefCard entityId={node.id} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <PropsCard title="Properties" entries={dataFields} />
        <PropsCard title="Provenance" entries={provFields} mono />
      </div>

      {context && node ? <RelatedSection context={context} selfId={node.id} /> : null}
    </div>
  );
}

function PropsCard({
  title,
  entries,
  mono,
}: {
  title: string;
  entries: Array<[string, unknown]>;
  mono?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", padding: 20 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.6 }}>
          {title}
        </h2>
        <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>None</p>
      </div>
    );
  }
  return (
    <div style={{ borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", padding: 20 }}>
      <h2 style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
        {title}
      </h2>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px" }}>
        {entries.map(([key, value]) => (
          <FieldRow key={key} field={key} value={value} mono={mono} />
        ))}
      </dl>
    </div>
  );
}

function FieldRow({ field, value, mono }: { field: string; value: unknown; mono?: boolean }) {
  const text = renderValue(value);
  return (
    <>
      <dt style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>{field}</dt>
      <dd
        style={{
          fontSize: 13,
          color: "#222",
          margin: 0,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, monospace" : undefined,
          wordBreak: "break-word",
        }}
      >
        {text}
      </dd>
    </>
  );
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(renderValue).join(", ");
  if (value && typeof value === "object") {
    const v = value as { toNumber?: () => number; toString?: () => string };
    if (typeof v.toNumber === "function") return String(v.toNumber());
    if (typeof v.toString === "function") return v.toString();
  }
  return JSON.stringify(value);
}

function RelatedSection({
  context,
  selfId,
}: {
  context: Awaited<ReturnType<typeof getContext>>;
  selfId: string;
}) {
  const related = context.nodes.filter((n) => n.id !== selfId);
  if (related.length === 0) {
    return (
      <div
        style={{
          borderRadius: 10,
          border: "1px dashed #e0e0e0",
          background: "#fafafa",
          padding: 24,
          textAlign: "center",
          color: "#888",
          fontSize: 13,
        }}
      >
        No related entities within 2 hops.
      </div>
    );
  }
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 12 }}>
        Related ({related.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {related.map((rel) => {
          const relProps = rel.properties as Record<string, unknown>;
          const relName =
            (relProps.name as string | undefined) ??
            (relProps.title as string | undefined) ??
            rel.id;
          return (
            <Link
              key={rel.id}
              href={entityHref(rel.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e0e0e0",
                background: "#fff",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <LabelChip label={rel.type} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{relName}</span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "#888",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  }}
                >
                  {rel.id}
                </span>
              </div>
              <ChevronRight size={14} color="#888" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LabelChip({ label }: { label: string }) {
  const palette: Record<string, { fg: string; bg: string }> = {
    Person: { fg: "#1a73e8", bg: "#e8f0fe" },
    Organization: { fg: "#0e7490", bg: "#e0f7fa" },
    Note: { fg: "#7c3aed", bg: "#f3e8ff" },
    Engagement: { fg: "#15803d", bg: "#dcfce7" },
    Decision: { fg: "#b45309", bg: "#fef3c7" },
  };
  const c = palette[label] ?? { fg: "#555", bg: "#f0f0f0" };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        padding: "2px 8px",
        borderRadius: 4,
        color: c.fg,
        background: c.bg,
      }}
    >
      {label}
    </span>
  );
}
