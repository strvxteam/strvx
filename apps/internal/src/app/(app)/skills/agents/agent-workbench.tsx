"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Rocket,
  Check,
  X,
  Globe,
  Import,
  Shield,
  Boxes,
  Copy,
  Pencil,
  Plus,
  Trash2,
  Zap,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import {
  toggleAgentRuleAction,
  updateAgentIdentityAction,
  updateAgentSettingsAction,
  deployAgentAction,
  createAgentAction,
  deleteAgentAction,
} from "@/app/actions";

type Agent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
  identity: string | null;
  includeCorrections: boolean;
  includeComponents: boolean;
  deployPath: string | null;
  deployedAt: Date | null;
  deployedOutput: string | null;
  createdAt: Date;
};

type LinkedRule = {
  linkId: string;
  included: boolean;
  skillId: string;
  skillName: string;
  skillSlug: string;
  skillDescription: string | null;
  skillType: string;
  skillCategory: string;
  skillScope: string;
  skillRules: unknown;
  skillPriority: number;
  skillIsActive: boolean;
};

type Rule = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  category: string;
  scope: string;
  rules: unknown;
  priority: number;
  isActive: boolean;
};

type AgentData = {
  agent: Agent;
  linkedRules: LinkedRule[];
  globalRules: Rule[];
  importableRules: Rule[];
} | null;

const TYPE_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  builder: { bg: "#e8f0fe", color: "#1a73e8", label: "Builder" },
  linter: { bg: "#fef3e2", color: "#e67e22", label: "Linter" },
  reviewer: { bg: "#f3e5f5", color: "#8e24aa", label: "Reviewer" },
  automation: { bg: "#e8f5e9", color: "#27ae60", label: "Automation" },
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  layout: { bg: "#e8f0fe", color: "#1a73e8" },
  "design-tokens": { bg: "#f3e5f5", color: "#8e24aa" },
  "component-preference": { bg: "#e8f5e9", color: "#27ae60" },
  behavioral: { bg: "#fef3e2", color: "#e67e22" },
  pattern: { bg: "#e0f2f1", color: "#00897b" },
};

const CATEGORY_LABELS: Record<string, string> = {
  layout: "Layout", "design-tokens": "Design Tokens",
  "component-preference": "Components", behavioral: "Behavioral", pattern: "Patterns",
};

export function AgentWorkbench({
  agents: initialAgents,
  allSkills,
  initialAgentData,
  initialSelectedId,
}: {
  agents: Agent[];
  allSkills: Rule[];
  initialAgentData: AgentData;
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const [agents, setAgents] = useState(initialAgents);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [agentData, setAgentData] = useState(initialAgentData);
  const [deployPreview, setDeployPreview] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState(agentData?.agent.identity ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const [createForm, setCreateForm] = useState({
    name: "", slug: "", description: "",
    type: "builder" as "builder" | "linter" | "reviewer" | "automation",
    identity: "", deployPath: ".claude/rules/",
  });

  const agent = agentData?.agent;
  const linkedRuleIds = new Set(
    (agentData?.linkedRules ?? []).filter((r) => r.included).map((r) => r.skillId)
  );
  const globalRules = agentData?.globalRules ?? [];
  const importableRules = agentData?.importableRules ?? [];
  const activeRuleCount = globalRules.length + [...linkedRuleIds].length;

  function selectAgent(id: string) {
    router.push(`/skills/agents?agent=${id}`);
  }

  function handleToggleRule(skillId: string) {
    if (!agent) return;
    startTransition(async () => {
      try {
        await toggleAgentRuleAction(agent.id, skillId);
        setAgentData((prev) => {
          if (!prev) return prev;
          const existing = prev.linkedRules.find((r) => r.skillId === skillId);
          if (existing) {
            return { ...prev, linkedRules: prev.linkedRules.map((r) => r.skillId === skillId ? { ...r, included: !r.included } : r) };
          }
          const rule = prev.importableRules.find((r) => r.id === skillId);
          if (rule) {
            return { ...prev, linkedRules: [...prev.linkedRules, {
              linkId: "temp", included: true, skillId: rule.id, skillName: rule.name,
              skillSlug: rule.slug, skillDescription: rule.description, skillType: rule.type,
              skillCategory: rule.category, skillScope: rule.scope, skillRules: rule.rules,
              skillPriority: rule.priority, skillIsActive: rule.isActive,
            }] };
          }
          return prev;
        });
        toast.success("Rule updated");
      } catch { toast.error("Failed to update rule"); }
    });
  }

  function handleSaveIdentity() {
    if (!agent) return;
    startTransition(async () => {
      try {
        await updateAgentIdentityAction(agent.id, identityDraft);
        setAgentData((prev) => prev ? { ...prev, agent: { ...prev.agent, identity: identityDraft } } : prev);
        setEditingIdentity(false);
        toast.success("Identity saved");
      } catch { toast.error("Failed to save"); }
    });
  }

  function handleToggleSetting(key: "includeCorrections" | "includeComponents") {
    if (!agent) return;
    const newVal = !agent[key];
    startTransition(async () => {
      try {
        await updateAgentSettingsAction(agent.id, { [key]: newVal });
        setAgentData((prev) => prev ? { ...prev, agent: { ...prev.agent, [key]: newVal } } : prev);
      } catch { toast.error("Failed to update"); }
    });
  }

  function handleDeploy() {
    if (!agent) return;
    setDeploying(true);
    startTransition(async () => {
      try {
        const result = await deployAgentAction(agent.id);
        setDeployPreview(result.output);
        setAgentData((prev) => prev ? { ...prev, agent: { ...prev.agent, deployedAt: new Date(), deployedOutput: result.output } } : prev);
        toast.success(`Deployed — ${result.rulesCount} rules written to ${result.path}`);
      } catch { toast.error("Deploy failed"); }
      finally { setDeploying(false); }
    });
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const newAgent = await createAgentAction({
          name: createForm.name,
          slug: createForm.slug,
          description: createForm.description || undefined,
          type: createForm.type,
        });
        if (createForm.identity) {
          await updateAgentIdentityAction(newAgent.id, createForm.identity);
        }
        if (createForm.deployPath) {
          await updateAgentSettingsAction(newAgent.id, { deployPath: createForm.deployPath });
        }
        setAgents((prev) => [...prev, { ...newAgent, identity: createForm.identity, includeCorrections: true, includeComponents: true, deployPath: createForm.deployPath, deployedAt: null, deployedOutput: null } as Agent]);
        setShowCreate(false);
        setCreateForm({ name: "", slug: "", description: "", type: "builder", identity: "", deployPath: ".claude/rules/" });
        toast.success("Agent created");
        router.refresh();
      } catch { toast.error("Failed to create"); }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteAgentAction(deleteTarget.id);
        setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success("Agent deleted");
        if (selectedId === deleteTarget.id) {
          router.push("/skills/agents");
        }
      } catch { toast.error("Failed to delete"); }
    });
  }

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 48px)", margin: "-16px -32px -96px -16px" }}>
      {/* Left panel — Agent list */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: "1px solid #e0e0e0",
        display: "flex", flexDirection: "column", backgroundColor: "#fafafa",
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Agents</h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Plus size={14} />
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#999" }}>{agents.length} agent{agents.length !== 1 ? "s" : ""}</p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {agents.map((a) => {
            const tc = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.builder;
            const isSelected = a.id === selectedId;
            return (
              <div
                key={a.id}
                onClick={() => selectAgent(a.id)}
                style={{
                  padding: "12px 14px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                  backgroundColor: isSelected ? "#fff" : "transparent",
                  border: isSelected ? "1px solid #e0e0e0" : "1px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: tc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bot size={15} style={{ color: tc.color }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, backgroundColor: tc.bg, color: tc.color }}>{tc.label}</span>
                      <span style={{ fontSize: 10, color: a.status === "active" ? "#27ae60" : "#888" }}>
                        {a.status === "active" ? "Active" : a.status}
                      </span>
                    </div>
                  </div>
                </div>
                {a.deployedAt && (
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    <Rocket size={9} /> Deployed {new Date(a.deployedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}

          {agents.length === 0 && !showCreate && (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#aaa" }}>
              <Bot size={24} style={{ marginBottom: 6, opacity: 0.3 }} />
              <p style={{ fontSize: 12 }}>No agents yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — Workbench */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        {/* Create form */}
        {showCreate && (
          <div style={{ marginBottom: 24, padding: 24, borderRadius: 10, border: "1px solid #e0e0e0" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>New Agent</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input placeholder="Name" value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }} />
              <select value={createForm.type}
                onChange={(e) => setCreateForm({ ...createForm, type: e.target.value as typeof createForm.type })}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
                <option value="builder">Builder</option>
                <option value="linter">Linter</option>
                <option value="reviewer">Reviewer</option>
                <option value="automation">Automation</option>
              </select>
            </div>
            <textarea placeholder="Description — what does this agent do?" value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              style={{ marginTop: 12, width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, minHeight: 60, resize: "vertical" }} />
            <textarea placeholder="Identity — how should this agent introduce itself to Claude Code?" value={createForm.identity}
              onChange={(e) => setCreateForm({ ...createForm, identity: e.target.value })}
              style={{ marginTop: 12, width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, minHeight: 60, resize: "vertical" }} />
            <input placeholder="Deploy path (e.g. .claude/rules/my-agent.md)" value={createForm.deployPath}
              onChange={(e) => setCreateForm({ ...createForm, deployPath: e.target.value })}
              style={{ marginTop: 12, width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, fontFamily: "monospace" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={handleCreate} disabled={!createForm.name}
                style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, backgroundColor: createForm.name ? "#111" : "#ccc", color: "#fff", border: "none", cursor: createForm.name ? "pointer" : "default" }}>
                Create Agent
              </button>
              <button onClick={() => setShowCreate(false)}
                style={{ padding: "10px 20px", fontSize: 13, borderRadius: 8, backgroundColor: "#fff", border: "1px solid #ddd", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* No agent selected */}
        {!agent && !showCreate && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa" }}>
            <Bot size={48} style={{ marginBottom: 12, opacity: 0.2 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: "#888" }}>Select an agent or create a new one</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Agents compose rules into deployable Claude Code configs</p>
          </div>
        )}

        {/* Agent detail */}
        {agent && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  backgroundColor: (TYPE_CONFIG[agent.type] ?? TYPE_CONFIG.builder).bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Bot size={24} style={{ color: (TYPE_CONFIG[agent.type] ?? TYPE_CONFIG.builder).color }} />
                </div>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{agent.name}</h1>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, backgroundColor: (TYPE_CONFIG[agent.type] ?? TYPE_CONFIG.builder).bg, color: (TYPE_CONFIG[agent.type] ?? TYPE_CONFIG.builder).color }}>
                      {(TYPE_CONFIG[agent.type] ?? TYPE_CONFIG.builder).label}
                    </span>
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {activeRuleCount} rules — {agent.deployedAt ? `Deployed ${new Date(agent.deployedAt).toLocaleDateString()}` : "Never deployed"}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteTarget(agent)}
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e0e0e0", backgroundColor: "#fff", cursor: "pointer", color: "#888" }}>
                  <Trash2 size={15} />
                </button>
                <button onClick={handleDeploy} disabled={deploying}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, borderRadius: 8, backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer" }}>
                  <Rocket size={16} /> {deploying ? "Deploying..." : "Deploy"}
                </button>
              </div>
            </div>

            {/* Description */}
            {agent.description && (
              <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, marginBottom: 20, maxWidth: 650 }}>{agent.description}</p>
            )}

            {/* Identity */}
            <div style={{ marginBottom: 20, padding: 18, borderRadius: 10, border: "1px solid #e0e0e0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Zap size={13} style={{ color: "#e67e22" }} />
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Identity</label>
                </div>
                <button onClick={() => { setEditingIdentity(!editingIdentity); setIdentityDraft(agent.identity ?? ""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: 2 }}>
                  <Pencil size={12} />
                </button>
              </div>
              {editingIdentity ? (
                <div style={{ marginTop: 10 }}>
                  <textarea value={identityDraft} onChange={(e) => setIdentityDraft(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={handleSaveIdentity} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, borderRadius: 6, backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
                    <button onClick={() => setEditingIdentity(false)} style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", backgroundColor: "#fff" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#333", lineHeight: 1.7, marginTop: 8 }}>
                  {agent.identity ?? <span style={{ color: "#aaa", fontStyle: "italic" }}>No identity set — click edit to define how this agent introduces itself.</span>}
                </p>
              )}
            </div>

            {/* Settings row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <button onClick={() => handleToggleSetting("includeCorrections")}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8,
                  fontSize: 12, fontWeight: 600, border: "1px solid #e0e0e0", cursor: "pointer",
                  backgroundColor: agent.includeCorrections ? "#e8f5e9" : "#fff",
                  color: agent.includeCorrections ? "#27ae60" : "#888",
                }}>
                <Shield size={14} /> Corrections {agent.includeCorrections ? "ON" : "OFF"}
              </button>
              <button onClick={() => handleToggleSetting("includeComponents")}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8,
                  fontSize: 12, fontWeight: 600, border: "1px solid #e0e0e0", cursor: "pointer",
                  backgroundColor: agent.includeComponents ? "#e8f0fe" : "#fff",
                  color: agent.includeComponents ? "#1a73e8" : "#888",
                }}>
                <Boxes size={14} /> Components {agent.includeComponents ? "ON" : "OFF"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, fontSize: 12, color: "#888", border: "1px solid #f0f0f0" }}>
                <Settings size={13} /> Deploy to: <code style={{ fontSize: 11, backgroundColor: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>{agent.deployPath ?? ".claude/rules/"}</code>
              </div>
            </div>

            {/* Rule Composition */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Rule Composition</h3>
                <span style={{ fontSize: 12, color: "#888" }}>{globalRules.length} global + {[...linkedRuleIds].length} imported</span>
              </div>

              {/* Global */}
              <div style={{ padding: 16, borderRadius: 10, backgroundColor: "#f8f9ff", border: "1px solid #e8edff", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Globe size={13} style={{ color: "#1a73e8" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Global — Always Included</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {globalRules.map((rule) => {
                    const cc = CATEGORY_COLORS[rule.category] ?? { bg: "#f5f5f5", color: "#555" };
                    const ruleCount = Array.isArray(rule.rules) ? (rule.rules as unknown[]).length : 0;
                    return (
                      <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
                        <Check size={14} style={{ color: "#1a73e8", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{rule.name}</span>
                        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, backgroundColor: cc.bg, color: cc.color }}>{CATEGORY_LABELS[rule.category] ?? rule.category}</span>
                        <span style={{ fontSize: 11, color: "#aaa" }}>{ruleCount} rules</span>
                        {rule.description && <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.description}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Importable */}
              <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e0e0e0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Import size={13} style={{ color: "#8e24aa" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8e24aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Importable — Toggle to Include</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {importableRules.map((rule) => {
                    const included = linkedRuleIds.has(rule.id);
                    const cc = CATEGORY_COLORS[rule.category] ?? { bg: "#f5f5f5", color: "#555" };
                    const ruleCount = Array.isArray(rule.rules) ? (rule.rules as unknown[]).length : 0;
                    return (
                      <div key={rule.id} onClick={() => handleToggleRule(rule.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 6, cursor: "pointer", opacity: included ? 1 : 0.5, transition: "all 0.15s" }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          border: included ? "none" : "2px solid #ccc",
                          backgroundColor: included ? "#111" : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {included && <Check size={13} style={{ color: "#fff" }} />}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{rule.name}</span>
                        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, backgroundColor: cc.bg, color: cc.color }}>{CATEGORY_LABELS[rule.category] ?? rule.category}</span>
                        <span style={{ fontSize: 11, color: "#aaa" }}>{ruleCount} rules</span>
                        {rule.description && <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.description}</span>}
                      </div>
                    );
                  })}
                  {importableRules.length === 0 && (
                    <p style={{ fontSize: 12, color: "#aaa", padding: "8px 0", fontStyle: "italic" }}>No importable rules available. Create rules with "importable" scope.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Deploy preview modal */}
      {deployPreview !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeployPreview(null)} />
          <div style={{ position: "relative", width: 800, maxHeight: "85vh", backgroundColor: "#fff", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Deployed</h2>
                <p style={{ fontSize: 12, color: "#27ae60", marginTop: 2 }}>
                  Written to <code style={{ backgroundColor: "#e8f5e9", padding: "2px 6px", borderRadius: 4 }}>{agent?.deployPath ?? ".claude/rules/strvx-uiux-agent.md"}</code> — active in next Claude Code session
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { navigator.clipboard.writeText(deployPreview); toast.success("Copied to clipboard"); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, borderRadius: 6, backgroundColor: "#111", color: "#fff", border: "none", cursor: "pointer" }}>
                  <Copy size={13} /> Copy
                </button>
                <button onClick={() => setDeployPreview(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={18} style={{ color: "#888" }} />
                </button>
              </div>
            </div>
            <pre style={{ flex: 1, overflow: "auto", padding: 16, borderRadius: 8, backgroundColor: "#1a1a2e", color: "#e0e0e0", fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {deployPreview}
            </pre>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.3)" }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: "relative", width: 400, backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete {deleteTarget.name}?</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>This agent and its rule links will be removed. The rules themselves are not affected.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 18px", fontSize: 13, borderRadius: 6, backgroundColor: "#fff", border: "1px solid #ddd", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, backgroundColor: "#ef4444", color: "#fff", border: "none", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
