import Link from "next/link";
import type { Metadata } from "next";
import { Network, BookOpen, Search as SearchIcon, ChevronRight } from "lucide-react";
import { labelCounts, recentEntities, searchEntities } from "@/lib/kg/queries";
import { entityHref } from "./helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Knowledge Graph — STRVX" };

interface KgHomeProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function KgHomePage({ searchParams }: KgHomeProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let counts: Array<{ label: string; count: number }> = [];
  let recent: Awaited<ReturnType<typeof recentEntities>> = [];
  let results: Awaited<ReturnType<typeof searchEntities>> = [];
  let loadError: string | null = null;

  try {
    if (query) {
      results = await searchEntities(query, 30);
    } else {
      [counts, recent] = await Promise.all([labelCounts(), recentEntities(12)]);
    }
  } catch (err) {
    loadError = (err as Error).message;
  }

  const totalNodes = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", display: "flex", alignItems: "center", gap: 10 }}>
            <Network size={20} color="#1a73e8" />
            Knowledge Graph
          </h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {totalNodes > 0 ? `${totalNodes.toLocaleString()} nodes indexed across the strvx graph` : "Search and browse the strvx KG"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/kg/graph"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #e0e0e0",
              background: "#fff",
              fontSize: 13,
              color: "#111",
              textDecoration: "none",
            }}
          >
            Graph
          </Link>
          <Link
            href="/kg/browse"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #e0e0e0",
              background: "#fff",
              fontSize: 13,
              color: "#111",
              textDecoration: "none",
            }}
          >
            Browse
          </Link>
          <Link
            href="/kg/notes"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "#111",
              color: "#fff",
              fontSize: 13,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <BookOpen size={13} /> Notes
          </Link>
        </div>
      </div>

      {/* Search bar (server-action via GET form) */}
      <form
        action="/kg"
        method="GET"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 10,
          padding: "10px 14px",
        }}
      >
        <SearchIcon size={16} color="#888" />
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search people, companies, notes…"
          style={{
            flex: 1,
            fontSize: 14,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "#111",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            background: "#111",
            color: "#fff",
            fontSize: 13,
            border: "none",
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </form>

      {loadError ? (
        <ErrorCard message={loadError} />
      ) : query ? (
        <SearchResults results={results} query={query} />
      ) : (
        <>
          <SummaryGrid counts={counts} />
          <RecentSection items={recent} />
        </>
      )}
    </div>
  );
}

function SummaryGrid({ counts }: { counts: Array<{ label: string; count: number }> }) {
  const featured = ["Person", "Organization", "Note", "Engagement", "Decision"];
  const top = featured
    .map((label) => ({ label, count: counts.find((c) => c.label === label)?.count ?? 0 }))
    .filter((x) => x.count > 0);
  if (top.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(top.length, 5)}, minmax(0, 1fr))`,
        gap: 12,
        marginBottom: 24,
      }}
    >
      {top.map((entry) => (
        <Link
          key={entry.label}
          href={`/kg/browse?label=${encodeURIComponent(entry.label)}`}
          style={{
            display: "block",
            borderRadius: 10,
            border: "1px solid #e0e0e0",
            background: "#fff",
            padding: 16,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.6 }}>
            {entry.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#111", marginTop: 4 }}>
            {entry.count.toLocaleString()}
          </div>
        </Link>
      ))}
    </div>
  );
}

function RecentSection({ items }: { items: Awaited<ReturnType<typeof recentEntities>> }) {
  if (items.length === 0) {
    return (
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
        No entities indexed yet. Run gbrain-ingestor or kg-ingestor backfill to populate.
      </div>
    );
  }
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 12 }}>Recently updated</h2>
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {entity.labels.slice(0, 2).map((label) => (
                  <LabelChip key={label} label={label} />
                ))}
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>
                  {entity.name ?? entity.id}
                </span>
              </div>
              {entity.summary ? (
                <p
                  style={{
                    fontSize: 13,
                    color: "#555",
                    marginTop: 4,
                    lineHeight: 1.5,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {entity.summary}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: "#888", marginTop: 2, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                  {entity.id}
                </p>
              )}
            </div>
            <ChevronRight size={16} color="#888" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function SearchResults({
  results,
  query,
}: {
  results: Awaited<ReturnType<typeof searchEntities>>;
  query: string;
}) {
  if (results.length === 0) {
    return (
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
        No matches for <strong style={{ color: "#111" }}>{query}</strong>. Try a different keyword.
      </div>
    );
  }
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 12 }}>
        {results.length} match{results.length === 1 ? "" : "es"} for &ldquo;{query}&rdquo;
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((r) => {
          const props = r.node.properties as Record<string, unknown>;
          const name =
            (props.name as string | undefined) ??
            (props.title as string | undefined) ??
            r.node.id;
          const summary = (props.summary as string | undefined) ?? null;
          return (
            <Link
              key={r.node.id}
              href={entityHref(r.node.id)}
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <LabelChip label={r.node.type} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#888",
                      marginLeft: "auto",
                    }}
                  >
                    score {r.score.toFixed(2)}
                  </span>
                </div>
                {summary ? (
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
                    {summary}
                  </p>
                ) : null}
              </div>
              <ChevronRight size={16} color="#888" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #fecaca",
        borderLeftWidth: 4,
        background: "#fef2f2",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>
        Couldn&apos;t reach the knowledge graph
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#7f1d1d",
          marginTop: 4,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      >
        {message}
      </div>
      <div style={{ fontSize: 12, color: "#7f1d1d", marginTop: 8 }}>
        Check NEO4J_URI, NEO4J_USER_RW, and NEO4J_PASSWORD_RW in .env.local.
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
