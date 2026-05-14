import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { listNotes } from "@/lib/kg/queries";
import { entityHref } from "../helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notes — KG" };

export default async function NotesPage() {
  let notes: Awaited<ReturnType<typeof listNotes>> = [];
  let loadError: string | null = null;

  try {
    notes = await listNotes(150);
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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Notes</h1>
        <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
          {notes.length} indexed from GBrain
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
      ) : notes.length === 0 ? (
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
          No Notes yet — run the gbrain-ingestor against your vault to populate.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notes.map((note) => (
            <Link
              key={note.id}
              href={entityHref(note.id)}
              style={{
                display: "block",
                padding: 16,
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                {note.note_type ? <NoteTypeChip type={note.note_type} /> : null}
                {note.owner_id ? (
                  <span style={{ fontSize: 11, color: "#888" }}>by {note.owner_id}</span>
                ) : null}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 4 }}>
                {note.title}
              </div>
              {note.summary ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "#555",
                    lineHeight: 1.5,
                    marginBottom: 8,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {note.summary}
                </div>
              ) : null}
              {note.tags && note.tags.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {note.tags.slice(0, 8).map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "#f0f0f0",
                        color: "#555",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {note.rel_path ? (
                <div
                  style={{
                    fontSize: 10,
                    color: "#888",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  }}
                >
                  {note.rel_path}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteTypeChip({ type }: { type: string }) {
  const palette: Record<string, { fg: string; bg: string }> = {
    decision: { fg: "#b91c1c", bg: "#fee2e2" },
    learning: { fg: "#15803d", bg: "#dcfce7" },
    project: { fg: "#b45309", bg: "#fef3c7" },
    memory: { fg: "#6d28d9", bg: "#ede9fe" },
    agent_doc: { fg: "#0e7490", bg: "#cffafe" },
    meeting_notes: { fg: "#9f1239", bg: "#ffe4e6" },
    idea: { fg: "#c2410c", bg: "#ffedd5" },
  };
  const c = palette[type] ?? { fg: "#555", bg: "#f0f0f0" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: c.fg,
        background: c.bg,
      }}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}
