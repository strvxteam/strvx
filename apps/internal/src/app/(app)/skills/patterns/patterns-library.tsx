"use client";

import { useState, startTransition } from "react";
import {
  Layout,
  List,
  PanelLeftClose,
  FileText,
  Pencil,
  Monitor,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPatternAction,
  togglePatternAction,
  deletePatternAction,
} from "@/app/actions";

type Pattern = {
  id: string;
  name: string;
  archetype: string;
  sourceProject: string;
  sourceFile: string | null;
  layoutTree: string;
  codeExample: string | null;
  annotations: unknown;
  isActive: boolean;
  createdAt: Date;
};

const ARCHETYPE_CONFIG: Record<string, { icon: typeof Layout; color: string; bg: string; label: string }> = {
  list: { icon: List, color: "#1a73e8", bg: "#e8f0fe", label: "List Page" },
  detail: { icon: FileText, color: "#8e24aa", bg: "#f3e5f5", label: "Detail Page" },
  dashboard: { icon: Monitor, color: "#27ae60", bg: "#e8f5e9", label: "Dashboard" },
  form: { icon: Pencil, color: "#e67e22", bg: "#fef3e2", label: "Form Page" },
  editor: { icon: Code2, color: "#00897b", bg: "#e0f2f1", label: "Editor Page" },
  split: { icon: PanelLeftClose, color: "#c0392b", bg: "#fee2e2", label: "Split Page" },
  kanban: { icon: Layout, color: "#6366f1", bg: "#eef2ff", label: "Kanban" },
  calendar: { icon: Layout, color: "#0891b2", bg: "#ecfeff", label: "Calendar" },
  analytics: { icon: Monitor, color: "#7c3aed", bg: "#f5f3ff", label: "Analytics" },
  settings: { icon: Layout, color: "#64748b", bg: "#f1f5f9", label: "Settings" },
  landing: { icon: Layout, color: "#059669", bg: "#ecfdf5", label: "Landing" },
  email: { icon: Layout, color: "#dc2626", bg: "#fef2f2", label: "Email" },
  tracker: { icon: Layout, color: "#d97706", bg: "#fffbeb", label: "Tracker" },
  grid: { icon: Layout, color: "#0284c7", bg: "#f0f9ff", label: "Grid" },
};

const ARCHETYPES = ["list", "detail", "dashboard", "form", "editor", "split", "kanban", "calendar", "analytics", "settings", "landing", "email", "tracker", "grid"];

export function PatternsLibrary({ initialPatterns }: { initialPatterns: Pattern[] }) {
  const [items, setItems] = useState(initialPatterns);
  const [filterArchetype, setFilterArchetype] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Pattern | null>(null);

  const [form, setForm] = useState({
    name: "", archetype: "list", sourceProject: "strvx-internal-tool",
    sourceFile: "", layoutTree: "", codeExample: "",
  });

  const filtered = filterArchetype ? items.filter((p) => p.archetype === filterArchetype) : items;

  // Group by archetype
  const grouped = new Map<string, Pattern[]>();
  for (const p of filtered) {
    const existing = grouped.get(p.archetype) ?? [];
    existing.push(p);
    grouped.set(p.archetype, existing);
  }

  function handleToggle(p: Pattern) {
    startTransition(async () => {
      try {
        const newState = await togglePatternAction(p.id);
        setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: newState } : x)));
        toast.success(`${p.name} ${newState ? "activated" : "deactivated"}`);
      } catch { toast.error("Failed to toggle"); }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deletePatternAction(deleteTarget.id);
        setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success("Pattern deleted");
      } catch { toast.error("Failed to delete"); }
    });
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const pattern = await createPatternAction({
          name: form.name,
          archetype: form.archetype,
          sourceProject: form.sourceProject,
          sourceFile: form.sourceFile || undefined,
          layoutTree: form.layoutTree,
          codeExample: form.codeExample || undefined,
        });
        setItems((prev) => [...prev, pattern].sort((a, b) => a.archetype.localeCompare(b.archetype)));
        setShowCreate(false);
        setForm({ name: "", archetype: "list", sourceProject: "strvx-internal-tool", sourceFile: "", layoutTree: "", codeExample: "" });
        toast.success("Pattern added");
      } catch { toast.error("Failed to create"); }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Patterns</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {items.length} layout patterns extracted from real codebases — {items.filter((p) => p.isActive).length} active
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer" }}>
          <Plus size={14} /> Add Pattern
        </button>
      </div>

      {/* Archetype filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => setFilterArchetype(null)}
          style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: !filterArchetype ? 600 : 400, backgroundColor: !filterArchetype ? "#111" : "#fff", color: !filterArchetype ? "#fff" : "#555", border: !filterArchetype ? "none" : "1px solid #e0e0e0", cursor: "pointer" }}>
          All ({items.length})
        </button>
        {ARCHETYPES.map((a) => {
          const config = ARCHETYPE_CONFIG[a];
          const count = items.filter((p) => p.archetype === a).length;
          if (count === 0) return null;
          const active = filterArchetype === a;
          return (
            <button key={a} onClick={() => setFilterArchetype(active ? null : a)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400, backgroundColor: active ? config.bg : "#fff", color: active ? config.color : "#555", border: active ? "none" : "1px solid #e0e0e0", cursor: "pointer" }}>
              <config.icon size={12} /> {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ marginBottom: 20, padding: 20, borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fafafa" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add Layout Pattern</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <input placeholder="Name (e.g. 'Clients Table')" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
            <select value={form.archetype} onChange={(e) => setForm({ ...form, archetype: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}>
              {ARCHETYPES.map((a) => <option key={a} value={a}>{ARCHETYPE_CONFIG[a].label}</option>)}
            </select>
            <input placeholder="Source project" value={form.sourceProject}
              onChange={(e) => setForm({ ...form, sourceProject: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
          </div>
          <input placeholder="Source file (e.g. src/app/(app)/clients/clients-table.tsx)" value={form.sourceFile}
            onChange={(e) => setForm({ ...form, sourceFile: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace" }} />
          <textarea placeholder="Layout tree (annotated hierarchy)" value={form.layoutTree}
            onChange={(e) => setForm({ ...form, layoutTree: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", minHeight: 120, resize: "vertical" }} />
          <textarea placeholder="Code example (optional — key implementation snippet)" value={form.codeExample}
            onChange={(e) => setForm({ ...form, codeExample: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", minHeight: 80, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleCreate} disabled={!form.name || !form.layoutTree}
              style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, backgroundColor: form.name && form.layoutTree ? "#111" : "#ccc", color: "#fff", border: "none", cursor: form.name && form.layoutTree ? "pointer" : "default" }}>
              Save Pattern
            </button>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, backgroundColor: "#fff", border: "1px solid #ddd", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Patterns by archetype */}
      {ARCHETYPES.map((archetype) => {
        const patterns = grouped.get(archetype);
        if (!patterns || patterns.length === 0) return null;
        const config = ARCHETYPE_CONFIG[archetype];
        return (
          <div key={archetype} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <config.icon size={14} style={{ color: config.color }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{config.label}</h3>
              <span style={{ fontSize: 11, color: "#aaa" }}>{patterns.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {patterns.map((p) => {
                const isExpanded = expandedId === p.id;
                return (
                  <div key={p.id} style={{ borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: p.isActive ? "#fff" : "#fafafa", opacity: p.isActive ? 1 : 0.5 }}>
                    <div onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}>
                      {isExpanded ? <ChevronDown size={14} style={{ color: "#888" }} /> : <ChevronRight size={14} style={{ color: "#888" }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{p.name}</span>
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, backgroundColor: "#f5f5f5", color: "#888" }}>{p.sourceProject}</span>
                        </div>
                        {p.sourceFile && <span style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{p.sourceFile}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={(e) => { e.stopPropagation(); handleToggle(p); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                          {p.isActive ? <ToggleRight size={20} style={{ color: "#27ae60" }} /> : <ToggleLeft size={20} style={{ color: "#ccc" }} />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 2 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "0 16px 16px 42px", borderTop: "1px solid #f0f0f0" }}>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Layout Tree</label>
                          <pre style={{ marginTop: 6, padding: 14, borderRadius: 8, backgroundColor: "#1a1a2e", color: "#e0e0e0", fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap" }}>
                            {p.layoutTree}
                          </pre>
                        </div>
                        {p.codeExample && (
                          <div style={{ marginTop: 12 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Code Example</label>
                            <pre style={{ marginTop: 6, padding: 14, borderRadius: 8, backgroundColor: "#111", color: "#4ade80", fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, overflow: "auto", maxHeight: 250, whiteSpace: "pre-wrap" }}>
                              {p.codeExample}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <Layout size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>{filterArchetype ? "No patterns for this archetype." : "No patterns yet. Run the codebase analyzer to extract them."}</p>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", width: 400, backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete &quot;{deleteTarget.name}&quot;?</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>This pattern will be removed from the agent config.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, backgroundColor: "#fff", border: "1px solid #ddd", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, backgroundColor: "#ef4444", color: "#fff", border: "none", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
