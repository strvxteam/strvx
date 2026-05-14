"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  addLabel,
  archiveThread,
  removeLabel,
  snoozeThread,
} from "../_actions";

type ShortcutHandlerProps = {
  threadIds: string[];
  topLabels?: string[];
  selectedThreadLabels?: string[];
  selectedThreadId?: string;
};

type SnoozePreset = { label: string; minutes: number | "tomorrow" | "next_mon" };

const SNOOZE_PRESETS: SnoozePreset[] = [
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Tomorrow", minutes: "tomorrow" },
  { label: "Next Monday", minutes: "next_mon" },
];

function resolveSnoozeUntil(preset: SnoozePreset): Date {
  const now = new Date();
  if (preset.minutes === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (preset.minutes === "next_mon") {
    const d = new Date(now);
    // 1 = Monday in JS (0=Sun)
    const day = d.getDay();
    const daysUntilMon = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return new Date(now.getTime() + preset.minutes * 60_000);
}

const GOTO_MAP: Record<string, string> = {
  i: "/agent-inbox",
  b: "/agent/brief",
  d: "/agent/drafts",
  c: "/calendar",
  f: "/agent/follow-ups",
  s: "/agent/settings",
};

const GOTO_TIMEOUT_MS = 1200;

export function KeyboardShortcuts({
  threadIds,
  topLabels = [],
  selectedThreadLabels = [],
  selectedThreadId: serverSelectedThreadId,
}: ShortcutHandlerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showHelp, setShowHelp] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [labelChips, setLabelChips] = useState<string[]>(selectedThreadLabels);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [, startTransition] = useTransition();
  const gotoPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotoActiveRef = useRef(false);

  // Whenever the server-rendered selection changes, reset local chip state.
  useEffect(() => {
    setLabelChips(selectedThreadLabels);
  }, [selectedThreadLabels, serverSelectedThreadId]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (target.isContentEditable) return true;
      if (target.closest('[role="textbox"]')) return true;
      if (target.closest(".ProseMirror")) return true; // TipTap editor
      return false;
    }

    function selectedThreadId(): string | null {
      return searchParams.get("thread");
    }

    function currentIndex(): number {
      const selected = selectedThreadId();
      if (!selected) return -1;
      return threadIds.indexOf(selected);
    }

    function goto(idx: number) {
      if (idx < 0 || idx >= threadIds.length) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("thread", threadIds[idx]);
      router.push(`/agent-inbox?${params.toString()}`);
    }

    function focusSearch() {
      const el = document.querySelector<HTMLInputElement>('[type="search"]');
      el?.focus();
    }

    function clearGoto() {
      if (gotoPendingRef.current) {
        clearTimeout(gotoPendingRef.current);
        gotoPendingRef.current = null;
      }
      gotoActiveRef.current = false;
    }

    function tryArchive() {
      const threadId = selectedThreadId();
      if (!threadId) {
        toast.error("Select a thread to archive.");
        return;
      }
      startTransition(async () => {
        try {
          await archiveThread(threadId);
          toast.success("Archived.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Archive failed");
        }
      });
    }

    function trySend() {
      const btn = document.querySelector<HTMLButtonElement>(
        "[data-shortcut='send']"
      );
      if (!btn) {
        toast.error("No draft to send.");
        return;
      }
      btn.click();
    }

    function handler(e: KeyboardEvent) {
      // Don't intercept while user is typing
      if (isTypingTarget(e.target)) {
        // Allow Esc to blur input
        if (e.key === "Escape" && e.target instanceof HTMLElement) {
          e.target.blur();
        }
        return;
      }

      // Cmd/Ctrl+Enter sends draft if visible
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        trySend();
        return;
      }

      // Other modifier keys → bail (let browser/Cmd-K handle)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();

      // Sequence handling: if `g` was just pressed, consume the next key as nav
      if (gotoActiveRef.current) {
        clearGoto();
        const target = GOTO_MAP[k];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }

      if (k === "g") {
        e.preventDefault();
        gotoActiveRef.current = true;
        gotoPendingRef.current = setTimeout(() => {
          clearGoto();
        }, GOTO_TIMEOUT_MS);
        return;
      }

      const idx = currentIndex();

      switch (k) {
        case "j":
          e.preventDefault();
          goto(idx < 0 ? 0 : Math.min(idx + 1, threadIds.length - 1));
          break;
        case "k":
          e.preventDefault();
          if (idx > 0) goto(idx - 1);
          break;
        case "o":
        case "enter":
          if (idx < 0 && threadIds.length > 0) {
            e.preventDefault();
            goto(0);
          }
          break;
        case "r":
          e.preventDefault();
          document
            .querySelector<HTMLButtonElement>("[data-shortcut='reply']")
            ?.click();
          break;
        case "e":
          e.preventDefault();
          tryArchive();
          break;
        case "s":
          e.preventDefault();
          if (selectedThreadId()) {
            setShowSnooze(true);
          } else {
            toast.error("Select a thread to snooze.");
          }
          break;
        case "l":
          e.preventDefault();
          if (selectedThreadId()) {
            setShowLabels(true);
          } else {
            toast.error("Select a thread to label.");
          }
          break;
        case "/":
          e.preventDefault();
          focusSearch();
          break;
        case "?":
          e.preventDefault();
          setShowHelp(true);
          break;
        case "escape":
          if (showHelp) setShowHelp(false);
          if (showSnooze) {
            setShowSnooze(false);
            setCustomMode(false);
            setCustomValue("");
          }
          if (showLabels) {
            setShowLabels(false);
            setLabelInput("");
          }
          break;
      }
    }

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (gotoPendingRef.current) clearTimeout(gotoPendingRef.current);
    };
  }, [router, searchParams, threadIds, showHelp, showSnooze, showLabels]);

  function handleSnoozePick(preset: SnoozePreset) {
    const threadId = searchParams.get("thread");
    if (!threadId) {
      setShowSnooze(false);
      return;
    }
    const until = resolveSnoozeUntil(preset);
    setShowSnooze(false);
    startTransition(async () => {
      try {
        await snoozeThread(threadId, until.toISOString());
        toast.success(`Snoozed until ${preset.label.toLowerCase()}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Snooze failed");
      }
    });
  }

  function handleAddLabel(raw: string) {
    const threadId = searchParams.get("thread");
    if (!threadId) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const out = await addLabel(threadId, trimmed);
        setLabelChips((prev) =>
          prev.includes(out.label) ? prev : [...prev, out.label]
        );
        setLabelInput("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Add label failed");
      }
    });
  }

  function handleRemoveLabel(label: string) {
    const threadId = searchParams.get("thread");
    if (!threadId) return;
    // Optimistic
    setLabelChips((prev) => prev.filter((l) => l !== label));
    startTransition(async () => {
      try {
        await removeLabel(threadId, label);
      } catch (err) {
        // Roll back
        setLabelChips((prev) =>
          prev.includes(label) ? prev : [...prev, label]
        );
        toast.error(err instanceof Error ? err.message : "Remove label failed");
      }
    });
  }

  function handleCustomSubmit(value: string) {
    const threadId = searchParams.get("thread");
    if (!threadId) {
      setShowSnooze(false);
      return;
    }
    if (!value) {
      toast.error("Pick a date and time.");
      return;
    }
    const until = new Date(value);
    if (Number.isNaN(until.getTime())) {
      toast.error("Invalid date.");
      return;
    }
    if (until.getTime() <= Date.now()) {
      toast.error("Pick a future time.");
      return;
    }
    setShowSnooze(false);
    startTransition(async () => {
      try {
        await snoozeThread(threadId, until.toISOString());
        toast.success(`Snoozed until ${until.toLocaleString()}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Snooze failed");
      }
    });
  }

  return (
    <>
      {showSnooze && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => {
            setShowSnooze(false);
            setCustomMode(false);
            setCustomValue("");
          }}
        >
          <div
            className="rounded-md border w-[300px]"
            style={{ background: "#ffffff", borderColor: "#e0e0e0" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div
              className="px-4 py-2 text-[11px] uppercase font-semibold"
              style={{ color: "#888", borderBottom: "1px solid #f0f0f0" }}
            >
              Snooze until…
            </div>
            <div className="py-1">
              {SNOOZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleSnoozePick(preset)}
                  className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f5f5]"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomMode((v) => !v)}
                className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#f5f5f5]"
                style={{
                  borderTop: "1px solid #f0f0f0",
                  color: customMode ? "#1a73e8" : "inherit",
                }}
              >
                Custom…
              </button>
              {customMode && (
                <div
                  className="px-4 py-3 flex flex-col gap-2"
                  style={{ borderTop: "1px solid #f0f0f0" }}
                >
                  <input
                    type="datetime-local"
                    value={customValue}
                    onChange={(ev) => setCustomValue(ev.target.value)}
                    className="border rounded px-2 py-1 text-[13px]"
                    style={{ borderColor: "#d0d0d0" }}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomMode(false);
                        setCustomValue("");
                      }}
                      className="px-3 py-1 rounded text-[12px]"
                      style={{ background: "#f0f0f0", color: "#333" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCustomSubmit(customValue)}
                      className="px-3 py-1 rounded text-[12px]"
                      style={{ background: "#1a73e8", color: "#fff" }}
                    >
                      Snooze
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLabels && (
        <div
          className="fixed z-50 rounded-md border"
          style={{
            background: "#ffffff",
            borderColor: "#e0e0e0",
            width: 280,
            bottom: 24,
            right: 24,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{ borderBottom: "1px solid #f0f0f0" }}
          >
            <span
              className="text-[11px] uppercase font-semibold"
              style={{ color: "#888" }}
            >
              Labels
            </span>
            <button
              type="button"
              onClick={() => {
                setShowLabels(false);
                setLabelInput("");
              }}
              className="text-[11px]"
              style={{
                background: "transparent",
                border: "none",
                color: "#888",
                cursor: "pointer",
              }}
            >
              esc
            </button>
          </div>

          {labelChips.length > 0 && (
            <div
              className="px-3 py-2 flex flex-wrap gap-1"
              style={{ borderBottom: "1px solid #f0f0f0" }}
            >
              {labelChips.map((label) => (
                <span
                  key={label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: "#f5f5f5",
                    color: "#444",
                  }}
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => handleRemoveLabel(label)}
                    aria-label={`Remove ${label}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#888",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="px-3 py-2">
            <input
              type="text"
              autoFocus
              value={labelInput}
              placeholder="Add label…"
              onChange={(ev) => setLabelInput(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  handleAddLabel(labelInput);
                } else if (ev.key === "Escape") {
                  ev.preventDefault();
                  setShowLabels(false);
                  setLabelInput("");
                }
              }}
              className="w-full text-[13px] px-2 py-1 rounded border"
              style={{ borderColor: "#d0d0d0" }}
            />
          </div>

          {topLabels.length > 0 && (
            <div
              className="px-3 pb-2"
              style={{ borderTop: "1px solid #f0f0f0" }}
            >
              <div
                className="text-[10px] uppercase font-semibold mt-2 mb-1"
                style={{ color: "#999" }}
              >
                Suggested
              </div>
              <div className="flex flex-wrap gap-1">
                {topLabels
                  .filter((l) => !labelChips.includes(l))
                  .map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleAddLabel(label)}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 99,
                        background: "#ffffff",
                        border: "1px solid #e0e0e0",
                        color: "#666",
                        cursor: "pointer",
                      }}
                    >
                      + {label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowHelp(false)}
        >
          <div
            className="rounded-md border p-6 w-[480px] max-h-[80vh] overflow-y-auto"
            style={{ background: "#ffffff", borderColor: "#e0e0e0" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="font-semibold text-[16px] mb-4">
              Keyboard shortcuts
            </div>

            <ShortcutGroup label="Navigation">
              <ShortcutRow keys="j / k" label="Next / previous thread" />
              <ShortcutRow keys="o · Enter" label="Open thread" />
              <ShortcutRow keys="g i" label="Go to Inbox" />
              <ShortcutRow keys="g b" label="Go to Brief" />
              <ShortcutRow keys="g d" label="Go to Drafts" />
              <ShortcutRow keys="g c" label="Go to Calendar" />
              <ShortcutRow keys="g f" label="Go to Follow-ups" />
              <ShortcutRow keys="g s" label="Go to Settings" />
              <ShortcutRow keys="/" label="Focus search" />
              <ShortcutRow keys="⌘ K" label="Open command palette" />
            </ShortcutGroup>

            <ShortcutGroup label="Triage">
              <ShortcutRow keys="e" label="Archive thread" />
              <ShortcutRow keys="s" label="Snooze thread" />
              <ShortcutRow keys="l" label="Open label menu" />
            </ShortcutGroup>

            <ShortcutGroup label="Compose">
              <ShortcutRow keys="r" label="Reply" />
              <ShortcutRow keys="⌘ Enter" label="Send draft" />
            </ShortcutGroup>

            <ShortcutGroup label="Help">
              <ShortcutRow keys="?" label="Show this dialog" />
              <ShortcutRow keys="Esc" label="Close / blur" />
            </ShortcutGroup>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="px-3 py-1.5 rounded-md text-[13px]"
                style={{ background: "#1a73e8", color: "#ffffff" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShortcutGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div
        className="text-[11px] uppercase font-semibold mb-1"
        style={{ color: "#888" }}
      >
        {label}
      </div>
      <table className="w-full text-[13px]">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <tr>
      <td className="py-1.5" style={{ width: 120 }}>
        <kbd
          className="px-2 py-0.5 rounded font-mono text-[12px]"
          style={{
            background: "#f0f0f0",
            color: "#222",
            border: "1px solid #e0e0e0",
          }}
        >
          {keys}
        </kbd>
      </td>
      <td className="py-1.5 pl-3" style={{ color: "#666" }}>
        {label}
      </td>
    </tr>
  );
}
