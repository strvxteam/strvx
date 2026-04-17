"use client";

import { useState, startTransition } from "react";
import Link from "next/link";
import {
  Package,
  ExternalLink,
  Code2,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  toggleSkillLibraryAction,
  deleteSkillLibraryAction,
  createSkillLibraryAction,
} from "@/app/actions";

type Library = {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  githubUrl: string | null;
  description: string | null;
  installMethod: string;
  license: string | null;
  category: string;
  isActive: boolean;
  logoUrl: string | null;
  createdAt: Date;
  componentCount: number;
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  base: { bg: "#e8f0fe", color: "#1a73e8" },
  animation: { bg: "#fef3e2", color: "#e67e22" },
  editor: { bg: "#f3e5f5", color: "#8e24aa" },
  data: { bg: "#e8f5e9", color: "#27ae60" },
  ai: { bg: "#e0f2f1", color: "#00897b" },
  full: { bg: "#e3f2fd", color: "#1565c0" },
  utility: { bg: "#f5f5f5", color: "#555" },
};

const INSTALL_LABELS: Record<string, string> = {
  "copy-paste": "Copy/Paste",
  npm: "npm",
  "shadcn-cli": "shadcn CLI",
};

export function LibraryGrid({ initialLibraries }: { initialLibraries: Library[] }) {
  const [libraries, setLibraries] = useState(initialLibraries);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Library | null>(null);
  const [addForm, setAddForm] = useState({
    name: "",
    slug: "",
    url: "",
    githubUrl: "",
    description: "",
    installMethod: "npm" as "copy-paste" | "npm" | "shadcn-cli",
    license: "",
    category: "base" as "base" | "animation" | "editor" | "data" | "ai" | "full" | "utility",
    logoUrl: "",
  });

  function handleToggle(lib: Library) {
    startTransition(async () => {
      try {
        const newState = await toggleSkillLibraryAction(lib.id);
        setLibraries((prev) =>
          prev.map((l) => (l.id === lib.id ? { ...l, isActive: newState } : l))
        );
        toast.success(`${lib.name} ${newState ? "activated" : "deactivated"}`);
      } catch {
        toast.error("Failed to toggle library");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      try {
        await deleteSkillLibraryAction(id);
        setLibraries((prev) => prev.filter((l) => l.id !== id));
        setDeleteTarget(null);
        toast.success("Library deleted");
      } catch {
        toast.error("Failed to delete library");
      }
    });
  }

  function handleAdd() {
    startTransition(async () => {
      try {
        const lib = await createSkillLibraryAction(addForm);
        setLibraries((prev) => [...prev, { ...lib, componentCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        setShowAdd(false);
        setAddForm({ name: "", slug: "", url: "", githubUrl: "", description: "", installMethod: "npm", license: "", category: "base", logoUrl: "" });
        toast.success("Library added");
      } catch {
        toast.error("Failed to add library");
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Component Libraries</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {libraries.length} libraries — {libraries.filter((l) => l.isActive).length} active
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            fontSize: 13, fontWeight: 600, borderRadius: 8,
            backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer",
          }}
        >
          <Plus size={14} /> Add Library
        </button>
      </div>

      {showAdd && (
        <div style={{
          marginBottom: 20, padding: 20, borderRadius: 10,
          border: "1px solid #e0e0e0", backgroundColor: "#fafafa",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input
              placeholder="Name"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <input
              placeholder="Slug"
              value={addForm.slug}
              onChange={(e) => setAddForm({ ...addForm, slug: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <input
              placeholder="Website URL"
              value={addForm.url}
              onChange={(e) => setAddForm({ ...addForm, url: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <input
              placeholder="GitHub URL"
              value={addForm.githubUrl}
              onChange={(e) => setAddForm({ ...addForm, githubUrl: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <select
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value as typeof addForm.category })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              {["base", "animation", "editor", "data", "ai", "full", "utility"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={addForm.installMethod}
              onChange={(e) => setAddForm({ ...addForm, installMethod: e.target.value as typeof addForm.installMethod })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            >
              <option value="npm">npm</option>
              <option value="shadcn-cli">shadcn CLI</option>
              <option value="copy-paste">Copy/Paste</option>
            </select>
            <input
              placeholder="License (e.g. MIT)"
              value={addForm.license}
              onChange={(e) => setAddForm({ ...addForm, license: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
            <input
              placeholder="Logo URL"
              value={addForm.logoUrl}
              onChange={(e) => setAddForm({ ...addForm, logoUrl: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
            />
          </div>
          <textarea
            placeholder="Description"
            value={addForm.description}
            onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
            style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minHeight: 60, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={handleAdd}
              disabled={!addForm.name || !addForm.slug}
              style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6,
                backgroundColor: addForm.name && addForm.slug ? "#111" : "#ccc",
                color: "#fff", border: "none", cursor: addForm.name && addForm.slug ? "pointer" : "default",
              }}
            >
              Save
            </button>
            <button
              onClick={() => setShowAdd(false)}
              style={{ padding: "7px 16px", fontSize: 13, borderRadius: 6, backgroundColor: "#fff", border: "1px solid #ddd", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {libraries.map((lib) => (
          <div
            key={lib.id}
            style={{
              padding: 20, borderRadius: 10, border: "1px solid #e0e0e0",
              backgroundColor: lib.isActive ? "#fff" : "#fafafa",
              opacity: lib.isActive ? 1 : 0.6,
              transition: "opacity 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {lib.logoUrl ? (
                  <img src={lib.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Package size={14} style={{ color: "#888" }} />
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{lib.name}</h3>
                  <span style={{ fontSize: 11, color: "#888" }}>{lib.slug}</span>
                </div>
              </div>
              <button
                onClick={() => handleToggle(lib)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                title={lib.isActive ? "Deactivate" : "Activate"}
              >
                {lib.isActive ? (
                  <ToggleRight size={22} style={{ color: "#27ae60" }} />
                ) : (
                  <ToggleLeft size={22} style={{ color: "#ccc" }} />
                )}
              </button>
            </div>

            {lib.description && (
              <p style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {lib.description}
              </p>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                  backgroundColor: CATEGORY_COLORS[lib.category]?.bg ?? "#f5f5f5",
                  color: CATEGORY_COLORS[lib.category]?.color ?? "#555",
                }}
              >
                {lib.category}
              </span>
              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, backgroundColor: "#f5f5f5", color: "#555" }}>
                {INSTALL_LABELS[lib.installMethod] ?? lib.installMethod}
              </span>
              {lib.license && (
                <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, backgroundColor: "#f5f5f5", color: "#555" }}>
                  {lib.license}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Link
                href={`/skills/components?library=${lib.id}`}
                style={{ fontSize: 12, color: "#1a73e8", fontWeight: 500, textDecoration: "none" }}
              >
                {lib.componentCount} component{lib.componentCount !== 1 ? "s" : ""}
              </Link>
              <div style={{ display: "flex", gap: 6 }}>
                {lib.url && (
                  <a href={lib.url} target="_blank" rel="noopener noreferrer" style={{ color: "#888" }}>
                    <ExternalLink size={14} />
                  </a>
                )}
                {lib.githubUrl && (
                  <a href={lib.githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#888" }}>
                    <Code2 size={14} />
                  </a>
                )}
                <button
                  onClick={() => setDeleteTarget(lib)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ccc" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {libraries.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <Package size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>No libraries yet. Add your first component library.</p>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", width: 400, backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete {deleteTarget.name}?</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>This will remove the library and all its components. This cannot be undone.</p>
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
