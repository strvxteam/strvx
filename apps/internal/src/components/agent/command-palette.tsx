"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { searchEmailsAction } from "@/app/(app)/agent-inbox/_actions";

// ── Static commands ─────────────────────────────────────────────────────────

type StaticCommand = {
  id: string;
  label: string;
  href: string;
};

const STATIC_COMMANDS: StaticCommand[] = [
  { id: "goto-inbox", label: "Go to Inbox", href: "/agent-inbox" },
  { id: "goto-brief", label: "Go to Brief", href: "/agent/brief" },
  { id: "goto-drafts", label: "Go to Drafts", href: "/agent/drafts" },
  { id: "goto-calendar", label: "Go to Calendar", href: "/agent/calendar" },
  {
    id: "goto-follow-ups",
    label: "Go to Follow-ups",
    href: "/agent/follow-ups",
  },
  { id: "goto-settings", label: "Go to Settings", href: "/agent/settings" },
  { id: "goto-analytics", label: "Go to Analytics", href: "/agent/analytics" },
  {
    id: "connect-mailbox",
    label: "Connect mailbox",
    href: "/agent/connect-mailbox",
  },
];

type ThreadHit = {
  threadId: string;
  subject: string | null;
  snippet: string | null;
  fromEmail: string;
  sentAt: string;
};

const DEBOUNCE_MS = 200;
const MOUNT_ATTR = "data-agent-cmdk-mounted";

export function CommandPalette() {
  const router = useRouter();
  const [shouldMount, setShouldMount] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [threadHits, setThreadHits] = useState<ThreadHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Dedupe: only the first mount listens. Use a body data attribute as the
  // cross-instance flag. Set in effect so SSR + double-mount both work.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.body.hasAttribute(MOUNT_ATTR)) {
      setShouldMount(false);
      return;
    }
    document.body.setAttribute(MOUNT_ATTR, "true");
    setShouldMount(true);
    return () => {
      document.body.removeAttribute(MOUNT_ATTR);
    };
  }, []);

  // Filter static commands client-side by substring match.
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STATIC_COMMANDS;
    return STATIC_COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  // Flat result array for keyboard nav. Commands first, then threads.
  const flatResults = useMemo(() => {
    const items: Array<
      | { kind: "command"; cmd: StaticCommand }
      | { kind: "thread"; hit: ThreadHit }
    > = [];
    for (const cmd of filteredCommands) items.push({ kind: "command", cmd });
    for (const hit of threadHits) items.push({ kind: "thread", hit });
    return items;
  }, [filteredCommands, threadHits]);

  // Reset selection when result set shrinks below current cursor.
  useEffect(() => {
    if (activeIdx >= flatResults.length) {
      setActiveIdx(Math.max(0, flatResults.length - 1));
    }
  }, [flatResults.length, activeIdx]);

  // Debounced thread search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setThreadHits([]);
      return;
    }
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      startTransition(async () => {
        try {
          const hits = await searchEmailsAction(q);
          if (controller.signal.aborted) return;
          setThreadHits(hits.slice(0, 10));
        } catch (err) {
          if (controller.signal.aborted) return;
          // Silent fail — search is best-effort.
          console.error("[cmdk] search failed", err);
          setThreadHits([]);
        }
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Close on outside / Esc; open on Cmd+K.
  useEffect(() => {
    if (!shouldMount) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIdx(0);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, flatResults.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab") {
        // Cycle to the start of the next group.
        e.preventDefault();
        const commandsLen = filteredCommands.length;
        if (commandsLen === 0 || threadHits.length === 0) return;
        if (activeIdx < commandsLen) {
          setActiveIdx(commandsLen); // jump to first thread
        } else {
          setActiveIdx(0); // back to first command
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatResults[activeIdx];
        if (!item) return;
        if (item.kind === "command") {
          router.push(item.cmd.href);
        } else {
          router.push(`/agent-inbox?thread=${item.hit.threadId}`);
        }
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shouldMount, open, flatResults, filteredCommands.length, threadHits.length, activeIdx, router]);

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame so the input is in the DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSelect = useCallback(
    (idx: number) => {
      const item = flatResults[idx];
      if (!item) return;
      if (item.kind === "command") {
        router.push(item.cmd.href);
      } else {
        router.push(`/agent-inbox?thread=${item.hit.threadId}`);
      }
      setOpen(false);
    },
    [flatResults, router]
  );

  if (!shouldMount || !open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="rounded-md border w-[560px] max-h-[60vh] flex flex-col overflow-hidden"
        style={{ background: "#ffffff", borderColor: "#e0e0e0" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          placeholder="Type a command or search threads…"
          className="px-4 py-3 text-[14px] outline-none border-b"
          style={{ borderColor: "#f0f0f0", fontFamily: "inherit" }}
        />

        <div className="flex-1 overflow-y-auto py-1">
          {filteredCommands.length === 0 && threadHits.length === 0 && (
            <div
              className="px-4 py-6 text-center text-[13px]"
              style={{ color: "#888" }}
            >
              No results.
            </div>
          )}

          {filteredCommands.length > 0 && (
            <PaletteGroup label="Commands">
              {filteredCommands.map((cmd, i) => {
                const idx = i;
                return (
                  <PaletteRow
                    key={cmd.id}
                    label={cmd.label}
                    selected={idx === activeIdx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => handleSelect(idx)}
                  />
                );
              })}
            </PaletteGroup>
          )}

          {threadHits.length > 0 && (
            <PaletteGroup label="Threads">
              {threadHits.map((hit, i) => {
                const idx = filteredCommands.length + i;
                return (
                  <PaletteRow
                    key={hit.threadId}
                    label={hit.subject || "(no subject)"}
                    sublabel={`${hit.fromEmail} · ${hit.snippet ?? ""}`}
                    selected={idx === activeIdx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => handleSelect(idx)}
                  />
                );
              })}
            </PaletteGroup>
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div
        className="px-4 pt-2 pb-1 text-[11px] uppercase font-semibold tracking-wider"
        style={{ color: "#888" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function PaletteRow({
  label,
  sublabel,
  selected,
  onClick,
  onMouseEnter,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="w-full text-left px-4 py-1.5 block"
      style={{
        background: selected ? "#e8f0fe" : "transparent",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
      }}
    >
      <div style={{ color: "#111" }}>{label}</div>
      {sublabel && (
        <div
          className="truncate"
          style={{ color: "#888", fontSize: 11, marginTop: 1 }}
        >
          {sublabel}
        </div>
      )}
    </button>
  );
}
