"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Boxes,
  Copy,
  Trash2,
  X,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  updateSkillComponentAction,
  deleteSkillComponentAction,
} from "@/app/actions";

type Component = {
  id: string;
  libraryId: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  installCommand: string | null;
  importPath: string | null;
  dependencies: string[] | null;
  propsSummary: unknown;
  status: string;
  tags: string[] | null;
  createdAt: Date;
  libraryName: string;
  librarySlug: string;
};

type Library = {
  id: string;
  name: string;
  slug: string;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  available: { bg: "#f5f5f5", color: "#555" },
  installed: { bg: "#e8f5e9", color: "#27ae60" },
  approved: { bg: "#e8f0fe", color: "#1a73e8" },
  deprecated: { bg: "#fef3e2", color: "#e67e22" },
};

const CATEGORIES = [
  "form", "layout", "data-display", "overlay", "navigation", "feedback",
  "animation", "text-effect", "chart", "editor", "ai", "utility",
  "background", "button", "card", "table", "input",
];

export function ComponentsCatalog({
  initialComponents,
  libraries,
  initialFilters,
}: {
  initialComponents: Component[];
  libraries: Library[];
  initialFilters: { library: string; category: string; status: string; search: string };
}) {
  const router = useRouter();
  const [components] = useState(initialComponents);
  const [search, setSearch] = useState(initialFilters.search);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Component | null>(null);

  function applyFilters(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { ...initialFilters, ...overrides };
    if (merged.library) params.set("library", merged.library);
    if (merged.category) params.set("category", merged.category);
    if (merged.status) params.set("status", merged.status);
    if (merged.search) params.set("search", merged.search);
    router.push(`/skills/components?${params.toString()}`);
  }

  function handleSearch() {
    applyFilters({ search });
  }

  function clearFilters() {
    router.push("/skills/components");
  }

  function handleStatusChange(comp: Component, newStatus: string) {
    startTransition(async () => {
      try {
        await updateSkillComponentAction(comp.id, { status: newStatus });
        toast.success(`${comp.name} marked as ${newStatus}`);
        router.refresh();
      } catch {
        toast.error("Failed to update status");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteSkillComponentAction(deleteTarget.id);
        setDeleteTarget(null);
        toast.success("Component deleted");
        router.refresh();
      } catch {
        toast.error("Failed to delete");
      }
    });
  }

  const hasFilters = initialFilters.library || initialFilters.category || initialFilters.status || initialFilters.search;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Component Catalog</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {components.length} component{components.length !== 1 ? "s" : ""} across {libraries.length} libraries
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#aaa" }} />
          <input
            placeholder="Search components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
          />
        </div>
        <select
          value={initialFilters.library}
          onChange={(e) => applyFilters({ library: e.target.value })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
        >
          <option value="">All Libraries</option>
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>{lib.name}</option>
          ))}
        </select>
        <select
          value={initialFilters.category}
          onChange={(e) => applyFilters({ category: e.target.value })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={initialFilters.status}
          onChange={(e) => applyFilters({ status: e.target.value })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
        >
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="installed">Installed</option>
          <option value="approved">Approved</option>
          <option value="deprecated">Deprecated</option>
        </select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, background: "#fff", cursor: "pointer" }}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 10, overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ fontSize: 12 }}>Component</TableHead>
              <TableHead style={{ fontSize: 12 }}>Library</TableHead>
              <TableHead style={{ fontSize: 12 }}>Category</TableHead>
              <TableHead style={{ fontSize: 12 }}>Install</TableHead>
              <TableHead style={{ fontSize: 12 }}>Status</TableHead>
              <TableHead style={{ fontSize: 12, width: 60 }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((comp) => {
              const sc = STATUS_COLORS[comp.status] ?? STATUS_COLORS.available;
              return (
                <TableRow
                  key={comp.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedComponent(comp)}
                >
                  <TableCell>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{comp.name}</div>
                      {comp.description && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 1, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {comp.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "#555" }}>{comp.libraryName}</TableCell>
                  <TableCell>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, backgroundColor: "#f5f5f5", color: "#555" }}>
                      {comp.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    {comp.installCommand ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(comp.installCommand ?? "");
                          toast.success("Copied install command");
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}
                      >
                        <Copy size={10} /> {comp.installCommand.length > 30 ? comp.installCommand.slice(0, 30) + "..." : comp.installCommand}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500,
                      backgroundColor: sc.bg, color: sc.color,
                    }}>
                      {comp.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(comp); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {components.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            <Boxes size={28} style={{ marginBottom: 6, opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No components found. {hasFilters ? "Try adjusting your filters." : "Add libraries to populate the catalog."}</p>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedComponent && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            display: "flex", justifyContent: "flex-end",
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.2)" }}
            onClick={() => setSelectedComponent(null)}
          />
          <div style={{
            position: "relative", width: 420, backgroundColor: "#fff",
            borderLeft: "1px solid #e0e0e0", padding: 24, overflowY: "auto",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{selectedComponent.name}</h2>
              <button onClick={() => setSelectedComponent(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} style={{ color: "#888" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {selectedComponent.description && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Description</label>
                  <p style={{ fontSize: 13, color: "#333", marginTop: 4, lineHeight: 1.6 }}>{selectedComponent.description}</p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Library</label>
                  <p style={{ fontSize: 13, color: "#333", marginTop: 4 }}>{selectedComponent.libraryName}</p>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Category</label>
                  <p style={{ fontSize: 13, color: "#333", marginTop: 4 }}>{selectedComponent.category}</p>
                </div>
              </div>

              {selectedComponent.importPath && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Import</label>
                  <code style={{ display: "block", marginTop: 4, padding: "8px 12px", borderRadius: 6, backgroundColor: "#f5f5f5", fontSize: 12, fontFamily: "monospace" }}>
                    {selectedComponent.importPath}
                  </code>
                </div>
              )}

              {selectedComponent.installCommand && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Install</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <code style={{ flex: 1, padding: "8px 12px", borderRadius: 6, backgroundColor: "#f5f5f5", fontSize: 12, fontFamily: "monospace" }}>
                      {selectedComponent.installCommand}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(selectedComponent.installCommand ?? ""); toast.success("Copied"); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 4 }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}

              {selectedComponent.dependencies && selectedComponent.dependencies.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Dependencies</label>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {selectedComponent.dependencies.map((dep) => (
                      <span key={dep} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, backgroundColor: "#f5f5f5", color: "#555" }}>{dep}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedComponent.tags && selectedComponent.tags.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Tags</label>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {selectedComponent.tags.map((tag) => (
                      <span key={tag} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, backgroundColor: "#e8f0fe", color: "#1a73e8" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>Status</label>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {["available", "installed", "approved", "deprecated"].map((s) => {
                    const sc = STATUS_COLORS[s];
                    const active = s === selectedComponent.status;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(selectedComponent, s)}
                        style={{
                          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400,
                          backgroundColor: active ? sc.bg : "#fff",
                          color: active ? sc.color : "#888",
                          border: active ? "none" : "1px solid #e0e0e0",
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", width: 400, backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete {deleteTarget.name}?</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>This component will be removed from the catalog.</p>
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
