"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Trophy,
  PartyPopper,
  Target,
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
} from "lucide-react";

export interface DbGoal {
  id: string;
  name: string;
  description: string | null;
  targetValue: string;
  currentValue: string;
  unit: string;
  deadline: string | null;
  achieved: boolean | null;
}

export interface GoalsPageProps {
  currentRevenue?: number;
  dbGoals?: DbGoal[];
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function parseDollarInput(val: string): number {
  const cleaned = val.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

// ── Goal Form (shared for add/edit) ──────────────────

function GoalForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: { name: string; description: string; targetValue: number };
  onSave: (data: { name: string; description: string; targetValue: number }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [targetValue, setTargetValue] = useState(
    initial ? `$${initial.targetValue.toLocaleString()}` : "",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = parseDollarInput(targetValue);
    if (!name.trim() || target <= 0) return;
    onSave({ name: name.trim(), description: description.trim(), targetValue: target });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[#1a73e8] bg-white p-5">
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name"
            className="flex-1 rounded-md border border-[#e0e0e0] px-3 py-2 text-[14px] outline-none focus:border-[#1a73e8]"
            disabled={saving}
          />
          <input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="Target (e.g. $25,000)"
            className="w-44 rounded-md border border-[#e0e0e0] px-3 py-2 text-[14px] outline-none focus:border-[#1a73e8]"
            disabled={saving}
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8]"
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[#888] transition-colors hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || parseDollarInput(targetValue) <= 0}
            className="flex items-center gap-1.5 rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            {initial ? "Save" : "Add Goal"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────

export default function GoalsPage({
  currentRevenue: currentRevenueProp,
  dbGoals: initialGoals,
}: GoalsPageProps = {}) {
  const currentRevenue = currentRevenueProp ?? 0;
  const [goals, setGoals] = useState<DbGoal[]>(initialGoals ?? []);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sort goals by target value ascending
  const sorted = [...goals].sort(
    (a, b) => Number(a.targetValue) - Number(b.targetValue),
  );

  const nextGoal = sorted.find(
    (g) => !g.achieved && currentRevenue < Number(g.targetValue),
  );
  const nextGoalProgress = nextGoal
    ? Math.min((currentRevenue / Number(nextGoal.targetValue)) * 100, 100)
    : 100;
  const achievedCount = sorted.filter((g) => g.achieved).length;

  // ── CRUD handlers ──────────────────────────────────

  async function handleAdd(data: { name: string; description: string; targetValue: number }) {
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      const { goal } = await res.json();
      setGoals((prev) => [...prev, goal]);
      setShowAdd(false);
      toast.success("Goal added");
    } catch (err) {
      console.error("Failed to add goal:", err);
      toast.error("Failed to add goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(
    id: string,
    data: { name: string; description: string; targetValue: number },
  ) {
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) throw new Error("Failed");
      const { goal } = await res.json();
      setGoals((prev) => prev.map((g) => (g.id === id ? goal : g)));
      setEditingId(null);
      toast.success("Goal updated");
    } catch (err) {
      console.error("Failed to update goal:", err);
      toast.error("Failed to update goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch("/api/goals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed");
      setGoals((prev) => prev.filter((g) => g.id !== id));
      toast.success("Goal deleted");
    } catch (err) {
      console.error("Failed to delete goal:", err);
      toast.error("Failed to delete goal");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleAchieved(goal: DbGoal) {
    const newVal = !goal.achieved;
    // Optimistic update
    setGoals((prev) =>
      prev.map((g) => (g.id === goal.id ? { ...g, achieved: newVal } : g)),
    );
    try {
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, achieved: newVal }),
      });
      toast.success(newVal ? "Goal achieved!" : "Goal unmarked");
    } catch {
      // Revert on failure
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? { ...g, achieved: goal.achieved } : g)),
      );
      toast.error("Failed to update goal");
    }
  }

  // ── Render ─────────────────────────────────────────

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Goals</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] text-[#888]">
            <Trophy size={16} className="text-[#f59e0b]" />
            {achievedCount} of {sorted.length} achieved
          </div>
          {!showAdd && (
            <button
              onClick={() => {
                setShowAdd(true);
                setEditingId(null);
              }}
              className="flex items-center gap-1.5 rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#333]"
            >
              <Plus size={14} />
              Add Goal
            </button>
          )}
        </div>
      </div>

      {/* Current revenue + next goal */}
      <div className="mb-6 rounded-lg border border-[#e0e0e0] bg-white p-6">
        <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[#888]">
          Total Revenue
        </div>
        <div className="mb-4 text-3xl font-bold text-[#222]">
          ${currentRevenue.toLocaleString()}
        </div>

        {nextGoal && (
          <>
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="text-[#555]">
                Next:{" "}
                <span className="font-medium text-[#222]">{nextGoal.name}</span>{" "}
                at {formatCurrency(Number(nextGoal.targetValue))}
              </span>
              <span className="font-medium text-[#222]">
                {formatCurrency(Number(nextGoal.targetValue) - currentRevenue)} to go
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#f0f0f0]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#1a73e8] to-[#4fc3f7] transition-all"
                style={{ width: `${nextGoalProgress}%` }}
              />
            </div>
            <div className="mt-1 text-right text-[12px] text-[#888]">
              {nextGoalProgress.toFixed(0)}%
            </div>
          </>
        )}
      </div>

      {/* Add goal form */}
      {showAdd && (
        <div className="mb-4">
          <GoalForm
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Goals list */}
      {sorted.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#e0e0e0] bg-[#fafafa] py-16">
          <Target size={36} strokeWidth={1} className="mb-3 text-[#ccc]" />
          <p className="text-[14px] font-medium text-[#888]">No goals yet</p>
          <p className="mt-1 text-[12px] text-[#bbb]">
            Add your first revenue goal to start tracking progress
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map((goal) => {
            const target = Number(goal.targetValue);
            const progress = Math.min((currentRevenue / target) * 100, 100);
            const isNext = nextGoal?.id === goal.id;
            const isEditing = editingId === goal.id;
            const isDeleting = deletingId === goal.id;

            if (isEditing) {
              return (
                <GoalForm
                  key={goal.id}
                  initial={{
                    name: goal.name,
                    description: goal.description || "",
                    targetValue: target,
                  }}
                  onSave={(data) => handleEdit(goal.id, data)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              );
            }

            return (
              <div
                key={goal.id}
                className={`group rounded-lg border bg-white p-5 transition-all ${
                  goal.achieved
                    ? "border-[#c8e6c9]"
                    : isNext
                      ? "border-[#1a73e8] ring-1 ring-[#1a73e8]/20"
                      : "border-[#e0e0e0]"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon — click to toggle achieved */}
                  <button
                    onClick={() => handleToggleAchieved(goal)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      goal.achieved
                        ? "bg-[#e6f9e6] text-[#2e7d32] hover:bg-[#d0f0d0]"
                        : isNext
                          ? "bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d3e3fd]"
                          : "bg-[#f5f5f5] text-[#aaa] hover:bg-[#eee]"
                    }`}
                    title={goal.achieved ? "Mark as not achieved" : "Mark as achieved"}
                  >
                    {goal.achieved ? <PartyPopper size={20} /> : <Target size={20} />}
                  </button>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3
                        className={`text-[15px] font-semibold ${
                          goal.achieved ? "text-[#2e7d32]" : "text-[#222]"
                        }`}
                      >
                        {goal.name}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          goal.achieved
                            ? "bg-[#e6f9e6] text-[#2e7d32]"
                            : isNext
                              ? "bg-[#e8f0fe] text-[#1a73e8]"
                              : "bg-[#f5f5f5] text-[#888]"
                        }`}
                      >
                        {goal.achieved ? "Achieved" : isNext ? "In Progress" : "Locked"}
                      </span>

                      {/* Actions — visible on hover */}
                      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditingId(goal.id);
                            setShowAdd(false);
                          }}
                          className="rounded p-1 text-[#aaa] transition-colors hover:bg-[#f0f0f0] hover:text-[#555]"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          disabled={isDeleting}
                          className="rounded p-1 text-[#aaa] transition-colors hover:bg-[#fef2f2] hover:text-[#ef4444]"
                          title="Delete"
                        >
                          {isDeleting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>

                    {goal.description && (
                      <p className="mt-0.5 text-[13px] text-[#888]">
                        {goal.description}
                      </p>
                    )}

                    {/* Progress bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            goal.achieved
                              ? "bg-[#66bb6a]"
                              : isNext
                                ? "bg-gradient-to-r from-[#1a73e8] to-[#4fc3f7]"
                                : "bg-[#ddd]"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[12px] font-medium text-[#888]">
                        {formatCurrency(target)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
