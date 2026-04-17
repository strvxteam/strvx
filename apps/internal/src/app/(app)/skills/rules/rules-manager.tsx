"use client";

import { useState, startTransition } from "react";
import {
  BookOpen,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Download,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  toggleSkillAction,
  deleteSkillAction,
  createSkillAction,
  exportSkillsToAgentConfig,
} from "@/app/actions";

type Rule = { rule: string; detail?: string };
type Snippet = { label: string; code: string; language?: string };

type Skill = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  category: string;
  rules: unknown;
  codeSnippets: unknown;
  priority: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CATEGORY_LABELS: Record<string, string> = {
  layout: "Layout",
  "design-tokens": "Design Tokens",
  "component-preference": "Component Preference",
  behavioral: "Behavioral",
  pattern: "Pattern",
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  layout: { bg: "#e8f0fe", color: "#1a73e8" },
  "design-tokens": { bg: "#f3e5f5", color: "#8e24aa" },
  "component-preference": { bg: "#e8f5e9", color: "#27ae60" },
  behavioral: { bg: "#fef3e2", color: "#e67e22" },
  pattern: { bg: "#e0f2f1", color: "#00897b" },
};

type Tab = "presets" | "custom";

export function RulesManager({
  initialPresets,
  initialCustom,
}: {
  initialPresets: Skill[];
  initialCustom: Skill[];
}) {
  const [tab, setTab] = useState<Tab>("presets");
  const [presets, setPresets] = useState(initialPresets);
  const [custom, setCustom] = useState(initialCustom);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    category: "pattern" as "layout" | "design-tokens" | "component-preference" | "behavioral" | "pattern",
    rules: [{ rule: "", detail: "" }] as Rule[],
    codeSnippets: [] as Snippet[],
    priority: 0,
  });

  const allSkills = tab === "presets" ? presets : custom;

  function handleToggle(skill: Skill) {
    startTransition(async () => {
      try {
        const newState = await toggleSkillAction(skill.id);
        const updater = skill.type === "preset" ? setPresets : setCustom;
        updater((prev) => prev.map((s) => (s.id === skill.id ? { ...s, isActive: newState } : s)));
        toast.success(`${skill.name} ${newState ? "activated" : "deactivated"}`);
      } catch {
        toast.error("Failed to toggle skill");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteSkillAction(deleteTarget.id);
        const updater = deleteTarget.type === "preset" ? setPresets : setCustom;
        updater((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success("Rule deleted");
      } catch {
        toast.error("Failed to delete");
      }
    });
  }

  function handleCreate() {
    const validRules = form.rules.filter((r) => r.rule.trim());
    startTransition(async () => {
      try {
        const skill = await createSkillAction({
          name: form.name,
          slug: form.slug,
          description: form.description || undefined,
          type: "custom",
          category: form.category,
          rules: validRules.length > 0 ? validRules : undefined,
          codeSnippets: form.codeSnippets.length > 0 ? form.codeSnippets : undefined,
          priority: form.priority,
        });
        setCustom((prev) => [...prev, skill].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)));
        setShowCreate(false);
        setForm({ name: "", slug: "", description: "", category: "pattern", rules: [{ rule: "", detail: "" }], codeSnippets: [], priority: 0 });
        setTab("custom");
        toast.success("Rule created");
      } catch {
        toast.error("Failed to create rule");
      }
    });
  }

  function handleExport() {
    setExportLoading(true);
    startTransition(async () => {
      try {
        const md = await exportSkillsToAgentConfig();
        setExportPreview(md);
      } catch {
        toast.error("Failed to generate export");
      } finally {
        setExportLoading(false);
      }
    });
  }

  function copyExport() {
    if (exportPreview) {
      navigator.clipboard.writeText(exportPreview);
      toast.success("Copied to clipboard — paste into .claude/rules/strvx-design-system.md");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Rules</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {presets.length + custom.length} rules — {[...presets, ...custom].filter((s) => s.isActive).length} active
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleExport}
            disabled={exportLoading}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              backgroundColor: "#fff", color: "#111", border: "1px solid #ddd", cursor: "pointer",
            }}
          >
            <Download size={14} /> Export to Agent Config
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer",
            }}
          >
            <Plus size={14} /> New Rule
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #e0e0e0" }}>
        {(["presets", "custom"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "#111" : "#888",
              borderBottom: tab === t ? "2px solid #111" : "2px solid transparent",
              background: "none", border: "none", borderBottomWidth: 2,
              borderBottomStyle: "solid",
              borderBottomColor: tab === t ? "#111" : "transparent",
              cursor: "pointer", textTransform: "capitalize",
            }}
          >
            {t === "presets" ? `Presets (${presets.length})` : `Custom (${custom.length})`}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ marginBottom: 20, padding: 20, borderRadius: 10, border: "1px solid #e0e0e0", backgroundColor: "#fafafa" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New Custom Rule</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              placeholder="Priority (0 = highest)"
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
          </div>
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minHeight: 50, resize: "vertical" }}
          />
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Rules</label>
            {form.rules.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input
                  placeholder="Rule"
                  value={r.rule}
                  onChange={(e) => {
                    const next = [...form.rules];
                    next[i] = { ...next[i], rule: e.target.value };
                    setForm({ ...form, rules: next });
                  }}
                  style={{ flex: 2, padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                />
                <input
                  placeholder="Detail (optional)"
                  value={r.detail}
                  onChange={(e) => {
                    const next = [...form.rules];
                    next[i] = { ...next[i], detail: e.target.value };
                    setForm({ ...form, rules: next });
                  }}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                />
                <button
                  onClick={() => setForm({ ...form, rules: form.rules.filter((_, j) => j !== i) })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4 }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setForm({ ...form, rules: [...form.rules, { rule: "", detail: "" }] })}
              style={{ marginTop: 8, fontSize: 12, color: "#1a73e8", background: "none", border: "none", cursor: "pointer" }}
            >
              + Add rule
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={handleCreate}
              disabled={!form.name || !form.slug}
              style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6,
                backgroundColor: form.name && form.slug ? "#111" : "#ccc",
                color: "#fff", border: "none", cursor: form.name && form.slug ? "pointer" : "default",
              }}
            >
              Create Rule
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

      {/* Skills List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {allSkills.map((skill) => {
          const cc = CATEGORY_COLORS[skill.category] ?? { bg: "#f5f5f5", color: "#555" };
          const isExpanded = expandedId === skill.id;
          const rules = Array.isArray(skill.rules) ? (skill.rules as Rule[]) : [];
          const snippets = Array.isArray(skill.codeSnippets) ? (skill.codeSnippets as Snippet[]) : [];

          return (
            <div
              key={skill.id}
              style={{
                borderRadius: 10, border: "1px solid #e0e0e0",
                backgroundColor: skill.isActive ? "#fff" : "#fafafa",
                opacity: skill.isActive ? 1 : 0.6,
                transition: "opacity 0.2s",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                onClick={() => setExpandedId(isExpanded ? null : skill.id)}
              >
                {isExpanded ? <ChevronDown size={14} style={{ color: "#888" }} /> : <ChevronRight size={14} style={{ color: "#888" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{skill.name}</span>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                      backgroundColor: cc.bg, color: cc.color,
                    }}>
                      {CATEGORY_LABELS[skill.category] ?? skill.category}
                    </span>
                    {skill.type === "preset" && (
                      <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, backgroundColor: "#f5f5f5", color: "#888" }}>
                        preset
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{skill.description}</p>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {rules.length > 0 && (
                    <span style={{ fontSize: 11, color: "#aaa" }}>{rules.length} rule{rules.length !== 1 ? "s" : ""}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(skill); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                  >
                    {skill.isActive ? (
                      <ToggleRight size={22} style={{ color: "#27ae60" }} />
                    ) : (
                      <ToggleLeft size={22} style={{ color: "#ccc" }} />
                    )}
                  </button>
                  {skill.type === "custom" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(skill); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 2 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: "0 16px 16px 42px", borderTop: "1px solid #f0f0f0" }}>
                  {rules.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Rules</label>
                      <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                        {rules.map((r, i) => (
                          <li key={i} style={{ fontSize: 13, color: "#333", marginBottom: 4, lineHeight: 1.5 }}>
                            {r.rule}
                            {r.detail && <span style={{ color: "#888" }}> — {r.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {snippets.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Code Snippets</label>
                      {snippets.map((s, i) => (
                        <div key={i} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>{s.label}</div>
                          <pre style={{
                            padding: 12, borderRadius: 6, backgroundColor: "#1a1a2e", color: "#e0e0e0",
                            fontSize: 12, fontFamily: "monospace", overflow: "auto", maxHeight: 200,
                          }}>
                            {s.code}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                  {rules.length === 0 && snippets.length === 0 && (
                    <p style={{ fontSize: 12, color: "#aaa", marginTop: 12, fontStyle: "italic" }}>No rules or snippets defined yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allSkills.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <BookOpen size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>
            {tab === "presets" ? "No preset rules. Run the seed to populate." : "No custom rules yet. Create your first one."}
          </p>
        </div>
      )}

      {/* Export Preview Modal */}
      {exportPreview !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setExportPreview(null)} />
          <div style={{
            position: "relative", width: 700, maxHeight: "80vh",
            backgroundColor: "#fff", borderRadius: 12, padding: 24, overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Agent Config Preview</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={copyExport}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                    fontSize: 12, fontWeight: 600, borderRadius: 6,
                    backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer",
                  }}
                >
                  Copy to Clipboard
                </button>
                <button onClick={() => setExportPreview(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={18} style={{ color: "#888" }} />
                </button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
              Paste this into <code style={{ backgroundColor: "#f5f5f5", padding: "1px 4px", borderRadius: 3 }}>.claude/rules/strvx-design-system.md</code>
            </p>
            <pre style={{
              flex: 1, overflow: "auto", padding: 16, borderRadius: 8,
              backgroundColor: "#1a1a2e", color: "#e0e0e0", fontSize: 12,
              fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre-wrap",
            }}>
              {exportPreview}
            </pre>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", width: 400, backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete &quot;{deleteTarget.name}&quot;?</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>This rule and all its component links will be removed.</p>
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
