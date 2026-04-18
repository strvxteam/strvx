"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDevRepoAction, updateDevRepoAction, removeDevRepoAction } from "@/app/actions";
import { Plus, Trash2, Pencil, ExternalLink, Check } from "lucide-react";

interface Repo {
  id: string;
  name: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;
  vercelProjectId: string | null;
  ownerUserId: string | null;
  color: string;
  isActive: boolean;
  lastRefreshedAt: string | null;
  lastRefreshError: string | null;
}

interface TeamMember {
  id: string;
  name: string;
}

const COLORS = ["#1a73e8", "#27ae60", "#e67e22", "#c0392b", "#8e44ad", "#16a085", "#d4a017"];

function emptyDraft() {
  return {
    name: "",
    githubOwner: "",
    githubRepo: "",
    defaultBranch: "main",
    vercelProjectId: "",
    ownerUserId: "",
    color: COLORS[0],
  };
}

export default function ReposClient({ repos, teamMembers }: { repos: Repo[]; teamMembers: TeamMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 6,
    border: "1px solid #e0e0e0",
    padding: "7px 10px",
    fontSize: 13,
    color: "#222",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#888",
    marginBottom: 4,
    display: "block",
  };

  const openAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
    setShowForm(true);
  };

  const openEdit = (repo: Repo) => {
    setEditingId(repo.id);
    setDraft({
      name: repo.name,
      githubOwner: repo.githubOwner,
      githubRepo: repo.githubRepo,
      defaultBranch: repo.defaultBranch,
      vercelProjectId: repo.vercelProjectId ?? "",
      ownerUserId: repo.ownerUserId ?? "",
      color: repo.color,
    });
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  };

  const save = () => {
    setError(null);
    if (!draft.name.trim() || !draft.githubOwner.trim() || !draft.githubRepo.trim()) {
      setError("Name, owner, and repo are required");
      return;
    }
    startTransition(async () => {
      try {
        if (editingId) {
          await updateDevRepoAction(editingId, {
            name: draft.name,
            githubOwner: draft.githubOwner,
            githubRepo: draft.githubRepo,
            defaultBranch: draft.defaultBranch,
            vercelProjectId: draft.vercelProjectId.trim() || null,
            ownerUserId: draft.ownerUserId || null,
            color: draft.color,
          });
        } else {
          await addDevRepoAction({
            name: draft.name,
            githubOwner: draft.githubOwner,
            githubRepo: draft.githubRepo,
            defaultBranch: draft.defaultBranch,
            vercelProjectId: draft.vercelProjectId.trim() || null,
            ownerUserId: draft.ownerUserId || null,
            color: draft.color,
          });
        }
        closeForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  const remove = (id: string, name: string) => {
    if (!confirm(`Remove ${name} from Development?`)) return;
    startTransition(async () => {
      await removeDevRepoAction(id);
      router.refresh();
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Repos</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
            {repos.length} {repos.length === 1 ? "repo" : "repos"} tracked
          </p>
        </div>
        <button
          onClick={openAdd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 8,
            backgroundColor: "#111",
            color: "#fff",
            padding: "7px 14px",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Plus size={14} /> Add Repo
        </button>
      </div>

      {showForm && (
        <div style={{
          borderRadius: 10,
          border: "1px solid #1a73e8",
          backgroundColor: "#fff",
          padding: 20,
          marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 16 }}>
            {editingId ? "Edit repo" : "Add repo"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Display name</label>
              <input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="strvx" />
            </div>
            <div>
              <label style={labelStyle}>GitHub owner</label>
              <input style={inputStyle} value={draft.githubOwner} onChange={(e) => setDraft({ ...draft, githubOwner: e.target.value })} placeholder="strvxteam" />
            </div>
            <div>
              <label style={labelStyle}>GitHub repo</label>
              <input style={inputStyle} value={draft.githubRepo} onChange={(e) => setDraft({ ...draft, githubRepo: e.target.value })} placeholder="strvx" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Default branch</label>
              <input style={inputStyle} value={draft.defaultBranch} onChange={(e) => setDraft({ ...draft, defaultBranch: e.target.value })} placeholder="main" />
            </div>
            <div>
              <label style={labelStyle}>Vercel project ID</label>
              <input style={inputStyle} value={draft.vercelProjectId} onChange={(e) => setDraft({ ...draft, vercelProjectId: e.target.value })} placeholder="prj_..." />
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <select
                style={inputStyle}
                value={draft.ownerUserId}
                onChange={(e) => setDraft({ ...draft, ownerUserId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Color</label>
            <div style={{ display: "flex", gap: 8 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDraft({ ...draft, color: c })}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: c,
                    border: draft.color === c ? "2px solid #111" : "1px solid #e0e0e0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label={c}
                >
                  {draft.color === c && <Check size={14} color="#fff" />}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 12 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={save}
              disabled={isPending}
              style={{
                borderRadius: 8,
                backgroundColor: "#111",
                color: "#fff",
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 500,
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? "Saving…" : editingId ? "Save changes" : "Add repo"}
            </button>
            <button
              onClick={closeForm}
              style={{
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                backgroundColor: "#fff",
                color: "#555",
                padding: "7px 16px",
                fontSize: 13,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {repos.map((r) => (
          <div
            key={r.id}
            style={{
              borderRadius: 10,
              border: "1px solid #e0e0e0",
              borderLeft: `4px solid ${r.color}`,
              backgroundColor: "#fff",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{r.name}</h3>
                <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {r.githubOwner}/{r.githubRepo}
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <a
                  href={`https://github.com/${r.githubOwner}/${r.githubRepo}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    color: "#555",
                  }}
                  title="GitHub"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  onClick={() => openEdit(r)}
                  style={{ width: 26, height: 26, borderRadius: 6, color: "#555" }}
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remove(r.id, r.name)}
                  style={{ width: 26, height: 26, borderRadius: 6, color: "#c0392b" }}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Default branch</span>
                <span style={{ color: "#333", fontFamily: "ui-monospace,monospace" }}>{r.defaultBranch}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Vercel project</span>
                <span style={{ color: r.vercelProjectId ? "#333" : "#bbb" }}>
                  {r.vercelProjectId ? (
                    <a
                      href={`https://vercel.com/${r.vercelProjectId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#1a73e8" }}
                    >
                      Linked <ExternalLink size={10} />
                    </a>
                  ) : "Not linked"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Last refresh</span>
                <span style={{ color: r.lastRefreshedAt ? "#333" : "#bbb" }}>
                  {r.lastRefreshedAt ? new Date(r.lastRefreshedAt).toLocaleString() : "Never"}
                </span>
              </div>
              {r.lastRefreshError && (
                <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
                  {r.lastRefreshError}
                </p>
              )}
            </div>
          </div>
        ))}
        {repos.length === 0 && (
          <div style={{
            gridColumn: "1 / -1",
            border: "2px dashed #e0e0e0",
            borderRadius: 10,
            padding: 48,
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}>
            <p style={{ fontSize: 13, color: "#888" }}>No repos yet. Add your first repo above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
