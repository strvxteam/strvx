import "server-only";
import Link from "next/link";
import { Network } from "lucide-react";
import { getContext } from "@/lib/kg/queries";

interface Props {
  /** Full KG node id (e.g. "postgres:engagements:<uuid>"). */
  kgId: string;
  /** Max neighborhood entities to render. */
  limit?: number;
}

const TYPE_PALETTE: Record<string, { fg: string; bg: string }> = {
  Person: { fg: "#1a73e8", bg: "#e8f0fe" },
  Organization: { fg: "#0e7490", bg: "#e0f7fa" },
  Note: { fg: "#7c3aed", bg: "#f3e8ff" },
  Engagement: { fg: "#15803d", bg: "#dcfce7" },
  Decision: { fg: "#b45309", bg: "#fef3c7" },
  Task: { fg: "#ea580c", bg: "#fff7ed" },
  Interaction: { fg: "#0891b2", bg: "#ecfeff" },
};

/**
 * Server component that fetches KG neighborhood for an entity and renders a
 * compact related-entities list. Silently renders nothing if Neo4j is
 * unreachable or the entity isn't in the graph — KG outage must NOT block
 * the host page.
 */
export async function KgRelatedPanel({ kgId, limit = 12 }: Props) {
  let context: Awaited<ReturnType<typeof getContext>> | null = null;
  try {
    context = await getContext(kgId, 2, limit);
  } catch {
    return null;
  }

  if (!context || context.nodes.length === 0) {
    return null;
  }

  // Skip the center node + filter out nodes whose only "name" is the raw KG id
  // (Interactions and similar event-log entries without a human title). Those
  // are noise in a sidebar — keep them in the full graph view.
  const related = context.nodes
    .filter((n) => n.id !== kgId)
    .filter((n) => {
      const props = n.properties as Record<string, unknown>;
      const name =
        (props.name as string | undefined) ??
        (props.title as string | undefined) ??
        (typeof props.content === "string" ? (props.content as string) : undefined);
      if (!name) return false;
      if (name === n.id) return false;
      if (/^[a-z]+:[a-z_]+:[0-9a-f-]{20,}/i.test(name)) return false;
      return true;
    })
    .slice(0, limit);
  if (related.length === 0) return null;

  // Group by type so the list is scannable.
  const byType = new Map<string, typeof related>();
  for (const n of related) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }
  // Stable order: prefer Persons, then Orgs, then Engagements, Notes, Tasks, others.
  const order = ["Person", "Organization", "Engagement", "Note", "Decision", "Task", "Interaction"];
  const ordered = order
    .filter((t) => byType.has(t))
    .map((t) => [t, byType.get(t)!] as const)
    .concat(
      [...byType.entries()].filter(([t]) => !order.includes(t)) as Array<readonly [string, typeof related]>,
    );

  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid #eee",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <Network size={12} color="#888" />
        <span
          style={{
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontWeight: 600,
          }}
        >
          Knowledge graph
        </span>
        <Link
          href={`/kg/entity/${encodeURIComponent(kgId)}`}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#1a73e8",
            textDecoration: "none",
          }}
        >
          Explore →
        </Link>
      </div>
      {ordered.map(([type, items]) => {
        const c = TYPE_PALETTE[type] ?? { fg: "#555", bg: "#f0f0f0" };
        return (
          <div key={type} style={{ marginBottom: 12 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: c.fg,
                background: c.bg,
                padding: "2px 6px",
                borderRadius: 4,
                marginBottom: 6,
              }}
            >
              {type}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {items.map((n) => {
                const props = n.properties as Record<string, unknown>;
                const name =
                  (props.name as string | undefined) ??
                  (props.title as string | undefined) ??
                  (typeof props.content === "string"
                    ? (props.content as string).slice(0, 80)
                    : undefined) ??
                  n.id;
                return (
                  <Link
                    key={n.id}
                    href={`/kg/entity/${encodeURIComponent(n.id)}`}
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: "#333",
                      textDecoration: "none",
                      padding: "1px 0",
                      lineHeight: 1.35,
                    }}
                  >
                    {name}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
