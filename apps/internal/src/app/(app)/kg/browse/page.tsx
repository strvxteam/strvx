import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { labelCounts, listByLabel } from "@/lib/kg/queries";
import { entityHref } from "../helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Browse — KG" };

interface BrowsePageProps {
  searchParams: Promise<{ label?: string }>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { label } = await searchParams;

  let counts: Array<{ label: string; count: number }> = [];
  let items: Awaited<ReturnType<typeof listByLabel>> = [];
  let loadError: string | null = null;

  try {
    counts = await labelCounts();
    if (label) {
      items = await listByLabel(label, 200);
    }
  } catch (err) {
    loadError = (err as Error).message;
  }

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
        <ArrowLeft size={14} /> Knowledge Graph
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Browse by label</h1>
        <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
          {label ? `${items.length} ${label} ${items.length === 1 ? "entity" : "entities"}` : "Pick a label to drill in"}
        </p>
      </div>

      {loadError ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            padding: "12px 14px",
            fontSize: 13,
            color: "#7f1d1d",
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {counts.map((c) => {
          const isActive = c.label === label;
          return (
            <Link
              key={c.label}
              href={`/kg/browse?label=${encodeURIComponent(c.label)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                border: isActive ? "1px solid #111" : "1px solid #e0e0e0",
                background: isActive ? "#111" : "#fff",
                color: isActive ? "#fff" : "#111",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              {c.label}
              <span
                style={{
                  fontSize: 11,
                  color: isActive ? "#cbd5e1" : "#888",
                }}
              >
                {c.count.toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>

      {!label && counts.length > 0 ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px dashed #e0e0e0",
            background: "#fafafa",
            padding: 32,
            textAlign: "center",
            color: "#888",
            fontSize: 13,
          }}
        >
          Pick a label above to see entities.
        </div>
      ) : null}

      {label ? (
        items.length === 0 ? (
          <div
            style={{
              borderRadius: 10,
              border: "1px dashed #e0e0e0",
              background: "#fafafa",
              padding: 32,
              textAlign: "center",
              color: "#888",
              fontSize: 13,
            }}
          >
            No {label} entities yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((entity) => (
              <Link
                key={entity.id}
                href={entityHref(entity.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid #e0e0e0",
                  background: "#fff",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{entity.name}</div>
                  {entity.summary ? (
                    <p
                      style={{
                        fontSize: 13,
                        color: "#555",
                        marginTop: 4,
                        lineHeight: 1.5,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {entity.summary}
                    </p>
                  ) : (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#888",
                        marginTop: 4,
                        fontFamily: "ui-monospace, SFMono-Regular, monospace",
                      }}
                    >
                      {entity.id}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} color="#888" />
              </Link>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
