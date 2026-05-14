"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  updateAutonomyPolicy,
  type AutonomyPolicyInput,
} from "../_actions";

export type MailboxRow = {
  id: string;
  email: string;
  displayName: string | null;
  scopes: string[];
  isActive: boolean;
  updatedAt: Date | string;
};

type Confidence = "low" | "medium" | "high";
type Risk = "low" | "medium" | "high";
type Trust = "new" | "standard" | "trusted";

export type AutonomyStatsProp = {
  pendingNow: number;
  autoFires24h: number;
  cancelRate7dPct: number | null;
};

export type ActiveRule = {
  name: string;
  kind: string;
  pattern: string | null;
  description: string | null;
  bumpsTo: string;
};

export type AutonomyPolicyFormProps = {
  initial: AutonomyPolicyInput;
  activeRuleCount: number;
  activeRuleNames: string[];
  activeRules: ActiveRule[];
  stats: AutonomyStatsProp;
  mailboxes: MailboxRow[];
  defaultTab?: "replies" | "scheduling" | "followups" | "mailboxes";
  mailboxConnected?: string | null;
  mailboxError?: string | null;
};

type PresetKey = "conservative" | "balanced" | "aggressive";

type Preset = {
  key: PresetKey;
  label: string;
  badge: string | null;
  description: string;
  minConfidence: Confidence;
  minTrust: Trust;
  maxRisk: Risk;
  // shared window applied to BOTH replies + scheduling on click
  windowSeconds: number;
};

const PRESETS: Preset[] = [
  {
    key: "conservative",
    label: "Conservative",
    badge: null,
    description:
      "Trusted contacts only. High confidence, low risk. 90s to spot and cancel.",
    minConfidence: "high",
    minTrust: "trusted",
    maxRisk: "low",
    windowSeconds: 90,
  },
  {
    key: "balanced",
    label: "Balanced",
    badge: "Recommended",
    description:
      "High confidence + low risk, but any standard-tier contact qualifies. 60s window.",
    minConfidence: "high",
    minTrust: "standard",
    maxRisk: "low",
    windowSeconds: 60,
  },
  {
    key: "aggressive",
    label: "Aggressive",
    badge: null,
    description:
      "Medium confidence and medium-risk content allowed. 30s window — pay attention.",
    minConfidence: "medium",
    minTrust: "standard",
    maxRisk: "medium",
    windowSeconds: 30,
  },
];

/**
 * Org-wide Chief-of-Staff autonomy policy editor. Singleton `global` row.
 * Spec: docs/superpowers/specs/2026-05-13-cos-autonomy-design.md
 *
 * Redesigned 2026-05-13 to feel like a product surface, not an admin form:
 * live status header, preset cards, per-surface tabs, plain-language
 * threshold copy, content rule visibility, prominent shadow-mode banner.
 */
export function AutonomyPolicyForm({
  initial,
  activeRuleCount,
  activeRules,
  stats,
  mailboxes,
  defaultTab = "replies",
  mailboxConnected = null,
  mailboxError = null,
}: AutonomyPolicyFormProps) {
  const [repliesEnabled, setRepliesEnabled] = useState(initial.repliesEnabled);
  const [shadowOnly, setShadowOnly] = useState(initial.shadowOnly);
  const [minConfidence, setMinConfidence] = useState<Confidence>(
    initial.minConfidenceForAuto
  );
  const [maxRisk, setMaxRisk] = useState<Risk>(initial.maxRiskForAuto);
  const [minTrust, setMinTrust] = useState<Trust>(initial.minTrustForAuto);
  const [windowSeconds, setWindowSeconds] = useState(initial.windowSeconds);
  const [schedulingEnabled, setSchedulingEnabled] = useState(
    initial.schedulingEnabled
  );
  const [schedulingWindowSeconds, setSchedulingWindowSeconds] = useState(
    initial.schedulingWindowSeconds
  );
  const [followUpsEnabled, setFollowUpsEnabled] = useState(
    initial.followUpsEnabled
  );
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rulesExpanded, setRulesExpanded] = useState(false);

  const liveState = useMemo<
    "disabled" | "shadow" | "live"
  >(() => {
    if (!repliesEnabled && !schedulingEnabled) return "disabled";
    if (shadowOnly) return "shadow";
    return "live";
  }, [repliesEnabled, schedulingEnabled, shadowOnly]);

  const currentPreset = useMemo<PresetKey | "custom">(() => {
    const matched = PRESETS.find(
      (p) =>
        p.minConfidence === minConfidence &&
        p.minTrust === minTrust &&
        p.maxRisk === maxRisk &&
        p.windowSeconds === windowSeconds &&
        p.windowSeconds === schedulingWindowSeconds
    );
    return matched ? matched.key : "custom";
  }, [
    minConfidence,
    minTrust,
    maxRisk,
    windowSeconds,
    schedulingWindowSeconds,
  ]);

  const applyPreset = (preset: Preset) => {
    setMinConfidence(preset.minConfidence);
    setMinTrust(preset.minTrust);
    setMaxRisk(preset.maxRisk);
    setWindowSeconds(preset.windowSeconds);
    setSchedulingWindowSeconds(preset.windowSeconds);
  };

  const onSave = () => {
    setStatus("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateAutonomyPolicy({
        repliesEnabled,
        shadowOnly,
        minConfidenceForAuto: minConfidence,
        maxRiskForAuto: maxRisk,
        minTrustForAuto: minTrust,
        windowSeconds,
        schedulingEnabled,
        schedulingWindowSeconds,
        followUpsEnabled,
      });
      if (res.ok) {
        setStatus("saved");
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  };

  const onReset = () => {
    setRepliesEnabled(initial.repliesEnabled);
    setShadowOnly(initial.shadowOnly);
    setMinConfidence(initial.minConfidenceForAuto);
    setMaxRisk(initial.maxRiskForAuto);
    setMinTrust(initial.minTrustForAuto);
    setWindowSeconds(initial.windowSeconds);
    setSchedulingEnabled(initial.schedulingEnabled);
    setSchedulingWindowSeconds(initial.schedulingWindowSeconds);
    setFollowUpsEnabled(initial.followUpsEnabled);
    setStatus("idle");
    setErrorMsg(null);
  };

  // Outer wrapper picks up an amber tint when shadow mode is on — a
  // global reminder that nothing is firing yet.
  const shadowTinted = shadowOnly && (repliesEnabled || schedulingEnabled);

  return (
    <section
      className="mb-8"
      style={{
        borderRadius: 12,
        border: shadowTinted ? "1px solid #f5d27a" : "1px solid #e0e0e0",
        background: shadowTinted ? "#fffbf2" : "#ffffff",
        padding: 20,
        transition: "background 160ms ease, border-color 160ms ease",
      }}
    >
      {/* ── Header: title + live state ────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#111",
              letterSpacing: -0.1,
            }}
          >
            Autonomy policy
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#666",
              marginTop: 4,
              maxWidth: 560,
            }}
          >
            Decide when the Chief-of-Staff acts on its own and how long you
            have to step in. Edits don&apos;t retroactively re-evaluate drafts
            already counting down.
          </p>
        </div>
        <LiveStatePill state={liveState} />
      </div>

      {/* ── Live stats row ────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatTile
          label="Pending now"
          value={String(stats.pendingNow)}
          hint="Queued in their cancel window"
        />
        <StatTile
          label="Auto-fires (24h)"
          value={String(stats.autoFires24h)}
          hint="Sent without manual approval"
        />
        <StatTile
          label="Cancel rate (7d)"
          value={
            stats.cancelRate7dPct === null ? "—" : `${stats.cancelRate7dPct}%`
          }
          hint={
            stats.cancelRate7dPct === null
              ? "No activity yet"
              : "Of auto-fires + cancels"
          }
        />
      </div>

      {/* ── Shadow-mode banner ────────────────────────────────────── */}
      <ShadowBanner
        shadowOnly={shadowOnly}
        onToggle={() => setShadowOnly((s) => !s)}
        anyEnabled={repliesEnabled || schedulingEnabled}
      />

      {/* ── Preset cards ──────────────────────────────────────────── */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <SectionTitle>Pick a preset</SectionTitle>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
          One click sets confidence, trust, risk, and the cancel window.
          You can fine-tune below.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {PRESETS.map((preset) => (
            <PresetCard
              key={preset.key}
              preset={preset}
              isCurrent={currentPreset === preset.key}
              onClick={() => applyPreset(preset)}
            />
          ))}
        </div>
        {currentPreset === "custom" && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "#7a6700",
              background: "#fffaeb",
              border: "1px solid #f5e2a3",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <strong>Custom</strong> — your current settings don&apos;t match
            any preset. That&apos;s fine, just intentional.
          </div>
        )}
      </div>

      {/* ── Shared thresholds (apply to all tabs) ─────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Shared thresholds</SectionTitle>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
          These apply to both replies and scheduling. A draft must clear all
          three before it auto-fires.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 14,
          }}
        >
          <ThresholdSelect
            label="How sure must I be?"
            subtitle="min_confidence_for_auto"
            description="I'll only auto-send when my self-rated confidence is at this level or higher."
            value={minConfidence}
            onChange={(v) => setMinConfidence(v as Confidence)}
            options={[
              { value: "low", label: "Low — even rough drafts" },
              { value: "medium", label: "Medium — solid drafts" },
              { value: "high", label: "High — confident drafts only" },
            ]}
          />
          <ThresholdSelect
            label="How risky can the message be?"
            subtitle="max_risk_for_auto"
            description="If self-rated risk goes above this, I'll wait for your approval."
            value={maxRisk}
            onChange={(v) => setMaxRisk(v as Risk)}
            options={[
              { value: "low", label: "Low — safe content only" },
              { value: "medium", label: "Medium — some sensitive topics OK" },
              { value: "high", label: "High — anything goes" },
            ]}
          />
          <ThresholdSelect
            label="Who can I auto-message?"
            subtitle="min_trust_for_auto"
            description="Anyone with this trust tier or higher. Tier is inferred from engagement stage."
            value={minTrust}
            onChange={(v) => setMinTrust(v as Trust)}
            options={[
              { value: "new", label: "New — any contact" },
              { value: "standard", label: "Standard — opportunities and up" },
              { value: "trusted", label: "Trusted — active clients only" },
            ]}
          />
        </div>
      </div>

      {/* ── Per-surface tabs ──────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>What can I act on?</SectionTitle>
        <Tabs defaultValue={defaultTab} className="mt-2">
          <TabsList style={{ marginBottom: 16 }}>
            <TabsTrigger value="replies">Replies</TabsTrigger>
            <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
            <TabsTrigger value="followups">Follow-ups</TabsTrigger>
            <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          </TabsList>

          <TabsContent value="replies">
            <SurfacePanel
              title="Email replies"
              sentence={
                repliesEnabled
                  ? "When ON, I'll send routine replies on my own — but only when ALL three thresholds above match. You can still cancel during the window."
                  : "Currently off. Every reply will keep waiting for your approval in the inbox."
              }
              enabled={repliesEnabled}
              onToggle={() => setRepliesEnabled((v) => !v)}
              window={windowSeconds}
              onWindowChange={setWindowSeconds}
              shadowOnly={shadowOnly}
            />
          </TabsContent>

          <TabsContent value="scheduling">
            <SurfacePanel
              title="Scheduling proposals"
              sentence={
                schedulingEnabled
                  ? "When ON, I'll book, reschedule, and cancel routine meetings on my own. Hard gate: I will never displace an existing meeting without approval."
                  : "Currently off. Every meeting proposal will keep waiting for your approval."
              }
              enabled={schedulingEnabled}
              onToggle={() => setSchedulingEnabled((v) => !v)}
              window={schedulingWindowSeconds}
              onWindowChange={setSchedulingWindowSeconds}
              shadowOnly={shadowOnly}
            />
          </TabsContent>

          <TabsContent value="followups">
            <FollowUpsPanel
              enabled={followUpsEnabled}
              onToggle={() => setFollowUpsEnabled((v) => !v)}
            />
          </TabsContent>

          <TabsContent value="mailboxes">
            <MailboxesPanel
              mailboxes={mailboxes}
              connectedEmail={mailboxConnected}
              errorMsg={mailboxError}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Content rules ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Force-gate rules</SectionTitle>
        <Card size="sm">
          <CardHeader>
            <CardTitle style={{ fontSize: 14 }}>
              {activeRuleCount} active rule
              {activeRuleCount === 1 ? "" : "s"} will block auto-fire
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 12,
              }}
            >
              If any of these match the draft, I&apos;ll bump risk and
              fall back to waiting for your approval — regardless of preset.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 10,
              }}
            >
              {activeRules.length === 0 ? (
                <span style={{ fontSize: 12, color: "#888" }}>
                  (no active rules — every draft will pass the rule check)
                </span>
              ) : (
                activeRules.map((rule) => (
                  <Badge
                    key={rule.name}
                    variant="outline"
                    style={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 11,
                    }}
                  >
                    {rule.name}
                  </Badge>
                ))
              )}
            </div>
            {activeRules.length > 0 && (
              <button
                type="button"
                onClick={() => setRulesExpanded((e) => !e)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#1a73e8",
                  padding: 0,
                }}
              >
                {rulesExpanded ? "Hide rule details" : "Show rule details"}
              </button>
            )}
            {rulesExpanded && (
              <div
                style={{
                  marginTop: 12,
                  borderTop: "1px solid #f0f0f0",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {activeRules.map((rule) => (
                  <div
                    key={rule.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <code
                      style={{
                        fontSize: 11,
                        color: "#222",
                        background: "#f6f6f6",
                        borderRadius: 4,
                        padding: "2px 6px",
                        height: "fit-content",
                      }}
                    >
                      {rule.name}
                    </code>
                    <div>
                      <div style={{ color: "#444" }}>
                        {rule.description ?? <em>(no description)</em>}
                      </div>
                      <div
                        style={{ color: "#888", marginTop: 2, fontSize: 11 }}
                      >
                        kind: {rule.kind}
                        {rule.pattern ? ` · pattern: ${rule.pattern}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Save bar ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingTop: 16,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 8,
            background: pending ? "#999" : "#111",
            color: "#ffffff",
            border: "none",
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={pending}
          style={{
            fontSize: 12,
            color: "#1a73e8",
            background: "transparent",
            border: "none",
            cursor: pending ? "not-allowed" : "pointer",
            padding: 0,
          }}
        >
          Reset to last saved
        </button>
        {status === "saved" && (
          <span style={{ fontSize: 12, color: "#1b5e20" }}>
            Saved.
          </span>
        )}
        {status === "error" && errorMsg && (
          <span style={{ fontSize: 12, color: "#7c1c14" }}>{errorMsg}</span>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function LiveStatePill({
  state,
}: {
  state: "disabled" | "shadow" | "live";
}) {
  const config = {
    disabled: {
      label: "Disabled",
      bg: "#f0f0f0",
      fg: "#666",
      dot: "#999",
    },
    shadow: {
      label: "Shadow mode",
      bg: "#fff6dc",
      fg: "#7a5d00",
      dot: "#d39e00",
    },
    live: {
      label: "Live",
      bg: "#e3f7ea",
      fg: "#1b5e20",
      dot: "#22a14a",
    },
  }[state];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: config.bg,
        color: config.fg,
        borderRadius: 999,
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: config.dot,
        }}
      />
      {config.label}
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        background: "#fafafa",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#111",
          marginTop: 4,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function ShadowBanner({
  shadowOnly,
  onToggle,
  anyEnabled,
}: {
  shadowOnly: boolean;
  onToggle: () => void;
  anyEnabled: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 16px",
        borderRadius: 10,
        border: shadowOnly ? "1px solid #f0c878" : "1px solid #e0e0e0",
        background: shadowOnly ? "#fff8e7" : "#ffffff",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#1a1a1a",
            marginBottom: 2,
          }}
        >
          Try it safely — shadow mode
        </div>
        <div style={{ fontSize: 12, color: "#666", maxWidth: 520 }}>
          {shadowOnly
            ? anyEnabled
              ? "On. I'll evaluate every draft against your policy but never auto-fire. Use this to watch decisions for a day or two before going live."
              : "On. Flip Replies or Scheduling on to start logging shadow decisions."
            : "Off. Decisions WILL fire after the cancel window expires."}
        </div>
      </div>
      <Toggle
        checked={shadowOnly}
        onChange={onToggle}
        ariaLabel="Toggle shadow mode"
      />
    </div>
  );
}

function PresetCard({
  preset,
  isCurrent,
  onClick,
}: {
  preset: Preset;
  isCurrent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 14,
        borderRadius: 10,
        border: isCurrent ? "1.5px solid #111" : "1px solid #e0e0e0",
        background: isCurrent ? "#f6f6f6" : "#ffffff",
        cursor: "pointer",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>
          {preset.label}
        </span>
        {preset.badge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: "#1b5e20",
              background: "#e3f7ea",
              padding: "2px 6px",
              borderRadius: 999,
            }}
          >
            {preset.badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
        {preset.description}
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <MiniChip>conf: {preset.minConfidence}</MiniChip>
        <MiniChip>trust: {preset.minTrust}</MiniChip>
        <MiniChip>risk: {preset.maxRisk}</MiniChip>
        <MiniChip>{preset.windowSeconds}s</MiniChip>
      </div>
    </button>
  );
}

function MiniChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: "#444",
        background: "#f0f0f0",
        borderRadius: 4,
        padding: "2px 6px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {children}
    </span>
  );
}

function ThresholdSelect({
  label,
  subtitle,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  subtitle: string;
  description: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        background: "#ffffff",
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "1fr 220px",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#111",
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <code style={{ fontSize: 11, color: "#888" }}>{subtitle}</code>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          {description}
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 13,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #d0d0d0",
          background: "#ffffff",
          color: "#222",
          width: "100%",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SurfacePanel({
  title,
  sentence,
  enabled,
  onToggle,
  window: windowValue,
  onWindowChange,
  shadowOnly,
}: {
  title: string;
  sentence: string;
  enabled: boolean;
  onToggle: () => void;
  window: number;
  onWindowChange: (n: number) => void;
  shadowOnly: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        background: "#ffffff",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>
              {title}
            </span>
            <SurfaceStatusBadge enabled={enabled} shadowOnly={shadowOnly} />
          </div>
          <p style={{ fontSize: 12, color: "#666", maxWidth: 580 }}>
            {sentence}
          </p>
        </div>
        <BigToggle
          checked={enabled}
          onChange={onToggle}
          ariaLabel={`Enable ${title}`}
        />
      </div>

      <WindowSlider value={windowValue} onChange={onWindowChange} />
    </div>
  );
}

function MailboxesPanel({
  mailboxes,
  connectedEmail,
  errorMsg,
}: {
  mailboxes: MailboxRow[];
  connectedEmail: string | null;
  errorMsg: string | null;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        background: "#ffffff",
        padding: 16,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 4 }}>
          Connected mailboxes
        </div>
        <p style={{ fontSize: 12, color: "#666", maxWidth: 580 }}>
          Authorize a Gmail mailbox for the agent. The agent reads incoming mail
          and drafts replies. No mail is sent without explicit human approval.
        </p>
      </div>

      {connectedEmail && (
        <div
          style={{
            marginBottom: 12,
            borderRadius: 6,
            border: "1px solid #27ae60",
            background: "#e8f5e9",
            color: "#1b5e20",
            padding: "10px 14px",
            fontSize: 12,
          }}
        >
          Connected: {connectedEmail}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            marginBottom: 12,
            borderRadius: 6,
            border: "1px solid #e74c3c",
            background: "#fde8e8",
            color: "#7c1c14",
            padding: "10px 14px",
            fontSize: 12,
          }}
        >
          Error: {errorMsg}
        </div>
      )}

      <Link
        href="/api/auth/google/mailbox?return_to=/agent/settings?tab=mailboxes"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 6,
          border: "1px solid #e0e0e0",
          padding: "8px 14px",
          fontSize: 13,
          color: "#111",
          textDecoration: "none",
          background: "#fff",
          marginBottom: 16,
        }}
      >
        Connect a new Gmail mailbox
      </Link>

      {mailboxes.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>
          No mailboxes connected yet.
        </p>
      ) : (
        <table
          style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
              <MailboxHeaderCell>Email</MailboxHeaderCell>
              <MailboxHeaderCell>Scopes</MailboxHeaderCell>
              <MailboxHeaderCell>Status</MailboxHeaderCell>
              <MailboxHeaderCell>Updated</MailboxHeaderCell>
            </tr>
          </thead>
          <tbody>
            {mailboxes.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px 0" }}>
                  <div style={{ fontWeight: 500 }}>{m.email}</div>
                  {m.displayName && (
                    <div style={{ color: "#888", fontSize: 12 }}>
                      {m.displayName}
                    </div>
                  )}
                </td>
                <td style={{ padding: "10px 0", color: "#888" }}>
                  {m.scopes
                    .map((s) =>
                      s.replace("https://www.googleapis.com/auth/", "")
                    )
                    .join(", ")}
                </td>
                <td style={{ padding: "10px 0" }}>
                  {m.isActive ? "Active" : "Paused"}
                </td>
                <td style={{ padding: "10px 0", color: "#888" }}>
                  {new Date(m.updatedAt).toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MailboxHeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 0",
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase",
        color: "#888",
      }}
    >
      {children}
    </th>
  );
}

function FollowUpsPanel({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        background: "#ffffff",
        padding: 16,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>
            Stale-thread &amp; no-show nudges
          </span>
        </div>
        <p style={{ fontSize: 12, color: "#666", maxWidth: 580 }}>
          {enabled
            ? "When ON, I'll fire stale-thread and no-show nudges on my own. Note: stale_pipeline and post-meeting follow-ups always run, regardless of this switch."
            : "Currently off. No planner dispatch, no token spend, no nudge drafts created. (stale_pipeline and post-meeting follow-ups still run.)"}
        </p>
      </div>
      <BigToggle
        checked={enabled}
        onChange={onToggle}
        ariaLabel="Enable follow-up nudges"
      />
    </div>
  );
}

function SurfaceStatusBadge({
  enabled,
  shadowOnly,
}: {
  enabled: boolean;
  shadowOnly: boolean;
}) {
  if (!enabled) {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "#666",
          background: "#f0f0f0",
          padding: "2px 6px",
          borderRadius: 999,
        }}
      >
        Off
      </span>
    );
  }
  if (shadowOnly) {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "#7a5d00",
          background: "#fff6dc",
          padding: "2px 6px",
          borderRadius: 999,
        }}
      >
        Shadow
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: "#1b5e20",
        background: "#e3f7ea",
        padding: "2px 6px",
        borderRadius: 999,
      }}
    >
      Live
    </span>
  );
}

function WindowSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const sentence = useMemo(() => previewWindow(value), [value]);
  return (
    <div
      style={{
        borderTop: "1px solid #f0f0f0",
        marginTop: 8,
        paddingTop: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
            Cancel window
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            How long you have to click Cancel before I fire.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <input
            type="number"
            min={10}
            max={600}
            step={1}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                onChange(Math.max(10, Math.min(600, n)));
              }
            }}
            aria-label="Cancel window in seconds"
            style={{
              width: 70,
              padding: "6px 8px",
              border: "1px solid #d0d0d0",
              borderRadius: 6,
              fontSize: 13,
              textAlign: "right",
            }}
          />
          <span style={{ fontSize: 12, color: "#888" }}>sec</span>
        </div>
      </div>
      <input
        type="range"
        min={10}
        max={600}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Cancel window slider"
        style={{ width: "100%" }}
      />
      <div
        style={{
          fontSize: 12,
          color: "#555",
          marginTop: 8,
          background: "#f7f7f7",
          borderRadius: 6,
          padding: "6px 10px",
        }}
      >
        <strong>At {value} seconds</strong>, {sentence}
      </div>
    </div>
  );
}

function previewWindow(seconds: number): string {
  if (seconds < 30) {
    return "you've got barely a moment — blink-and-miss territory. Use only if you fully trust the gate.";
  }
  if (seconds < 90) {
    return "you've got about a minute to spot the notification + click Cancel before the agent fires.";
  }
  if (seconds < 300) {
    return "you've got a comfortable pause — enough to switch tabs, read the draft, and decide.";
  }
  return "this is a long pause — closer to async review than a cancel window.";
}

// ── Toggles ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: checked ? "#1a73e8" : "#d0d0d0",
        border: "none",
        position: "relative",
        cursor: "pointer",
        transition: "background 120ms ease",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#ffffff",
          transition: "left 120ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
        }}
      />
    </button>
  );
}

function BigToggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        width: 52,
        height: 28,
        borderRadius: 999,
        background: checked ? "#22a14a" : "#d0d0d0",
        border: "none",
        position: "relative",
        cursor: "pointer",
        transition: "background 120ms ease",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 27 : 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#ffffff",
          transition: "left 140ms ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
        }}
      />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: "#111",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}
