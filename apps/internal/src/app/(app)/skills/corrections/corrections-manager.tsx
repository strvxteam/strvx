"use client";

import { useState, startTransition } from "react";
import {
  AlertTriangle,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import {
  createCorrectionAction,
  toggleCorrectionAction,
  deleteCorrectionAction,
} from "@/app/actions";

type Correction = {
  id: string;
  title: string;
  description: string;
  wrongApproach: string | null;
  correctApproach: string | null;
  codeExample: string | null;
  severity: string;
  category: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
};

const SEVERITY_COLORS: Record<string, { bg: string; color: string }> = {
  critical: { bg: "#fee2e2", color: "#dc2626" },
  important: { bg: "#fef3e2", color: "#e67e22" },
  minor: { bg: "#f5f5f5", color: "#888" },
};

const CATEGORIES = [
  "layout", "component-choice", "spacing", "scrolling", "responsive",
  "accessibility", "performance", "styling", "pattern", "other",
];

export function CorrectionsManager({ initialCorrections }: { initialCorrections: Correction[] }) {
  const [items, setItems] = useState(initialCorrections);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Correction | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    wrongApproach: "",
    correctApproach: "",
    codeExample: "",
    severity: "important" as "critical" | "important" | "minor",
    category: "layout" as typeof CATEGORIES[number],
  });

  function handleToggle(item: Correction) {
    startTransition(async () => {
      try {
        const newState = await toggleCorrectionAction(item.id);
        setItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, isActive: newState } : c)));
        toast.success(`${item.title} ${newState ? "activated" : "deactivated"}`);
      } catch { toast.error("Failed to toggle"); }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteCorrectionAction(deleteTarget.id);
        setItems((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success("Correction deleted");
      } catch { toast.error("Failed to delete"); }
    });
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const correction = await createCorrectionAction({
          title: form.title,
          description: form.description,
          wrongApproach: form.wrongApproach || undefined,
          correctApproach: form.correctApproach || undefined,
          codeExample: form.codeExample || undefined,
          severity: form.severity,
          category: form.category,
        });
        setItems((prev) => [correction, ...prev]);
        setShowCreate(false);
        setForm({ title: "", description: "", wrongApproach: "", correctApproach: "", codeExample: "", severity: "important", category: "layout" });
        toast.success("Correction added");
      } catch { toast.error("Failed to create"); }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Corrections</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {items.length} correction{items.length !== 1 ? "s" : ""} — {items.filter((c) => c.isActive).length} active.
            These feed into the agent config export.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            fontSize: 13, fontWeight: 600, borderRadius: 8,
            backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer",
          }}
        >
          <Plus size={14} /> Log Correction
        </button>
      </div>

      {showCreate && (
        <div style={{ marginBottom: 20, padding: 20, borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fafafa" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Log a UI Correction</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <input
              placeholder="Title (e.g. 'Containers must be fixed-height')"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{ gridColumn: "1 / -1", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value as typeof form.severity })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              <option value="critical">Critical</option>
              <option value="important">Important</option>
              <option value="minor">Minor</option>
            </select>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Description — what the agent keeps getting wrong"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minHeight: 60, resize: "vertical" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <textarea
              placeholder="WRONG approach (what the agent does)"
              value={form.wrongApproach}
              onChange={(e) => setForm({ ...form, wrongApproach: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minHeight: 60, resize: "vertical" }}
            />
            <textarea
              placeholder="CORRECT approach (what it should do)"
              value={form.correctApproach}
              onChange={(e) => setForm({ ...form, correctApproach: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minHeight: 60, resize: "vertical" }}
            />
          </div>
          <textarea
            placeholder="Code example (optional — correct implementation)"
            value={form.codeExample}
            onChange={(e) => setForm({ ...form, codeExample: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", minHeight: 80, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={handleCreate}
              disabled={!form.title || !form.description}
              style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6,
                backgroundColor: form.title && form.description ? "#111" : "#ccc",
                color: "#fff", border: "none", cursor: form.title && form.description ? "pointer" : "default",
              }}
            >
              Save Correction
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, backgroundColor: "#fff", border: "1px solid #ddd", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => {
          const sc = SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.minor;
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              style={{
                borderRadius: 10, border: "1px solid #e0e0e0",
                backgroundColor: item.isActive ? "#fff" : "#fafafa",
                opacity: item.isActive ? 1 : 0.5,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                {isExpanded ? <ChevronDown size={14} style={{ color: "#888" }} /> : <ChevronRight size={14} style={{ color: "#888" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{item.title}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                      {item.severity}
                    </span>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, backgroundColor: "#f5f5f5", color: "#888" }}>
                      {item.category}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#888", marginTop: 2, maxWidth: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.description}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(item); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                  >
                    {item.isActive ? <ToggleRight size={22} style={{ color: "#27ae60" }} /> : <ToggleLeft size={22} style={{ color: "#ccc" }} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 2 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: "0 16px 16px 42px", borderTop: "1px solid #f0f0f0" }}>
                  <p style={{ fontSize: 13, color: "#333", marginTop: 12, lineHeight: 1.6 }}>{item.description}</p>
                  {item.wrongApproach && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 6, backgroundColor: "#fee2e2" }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>WRONG</label>
                      <p style={{ fontSize: 12, color: "#333", marginTop: 4 }}>{item.wrongApproach}</p>
                    </div>
                  )}
                  {item.correctApproach && (
                    <div style={{ marginTop: 8, padding: 12, borderRadius: 6, backgroundColor: "#e8f5e9" }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#27ae60" }}>CORRECT</label>
                      <p style={{ fontSize: 12, color: "#333", marginTop: 4 }}>{item.correctApproach}</p>
                    </div>
                  )}
                  {item.codeExample && (
                    <pre style={{
                      marginTop: 8, padding: 12, borderRadius: 6, backgroundColor: "#1a1a2e", color: "#e0e0e0",
                      fontSize: 12, fontFamily: "monospace", overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap",
                    }}>
                      {item.codeExample}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <Shield size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>No corrections yet. Log a UI mistake the agent keeps making.</p>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", width: 400, backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete &quot;{deleteTarget.title}&quot;?</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>This correction will be removed from the agent config.</p>
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
