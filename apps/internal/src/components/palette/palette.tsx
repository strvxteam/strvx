"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { PaletteResult, PaletteGroupKey } from "@/app/actions/palette";
import { searchAll } from "@/app/actions/palette";
import { getRecents, type UserRecent } from "@/app/actions/ui-state";
import { COMMANDS, matchCommands, type Command } from "./commands";
import { resolveRouteContext } from "@/lib/route-context";
import { PaletteInlineForm } from "./palette-form";

type Mode = "search" | "form";
type Recent = UserRecent;

const GROUP_ORDER: PaletteGroupKey[] = ["pages", "engagements", "contacts", "tasks", "projects", "invoices", "docs", "skills"];
const GROUP_LABELS: Record<PaletteGroupKey, string> = {
  pages: "Pages", engagements: "Engagements", contacts: "Contacts", tasks: "Tasks",
  projects: "Projects", invoices: "Invoices", docs: "Docs", skills: "Skills",
};

export function Palette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [selected, setSelected] = useState(0);
  const [, startSearch] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const ctx = resolveRouteContext(pathname ?? "/");
  const hasEngagementCtx = ctx?.kind === "engagement";
  const commandMatches = matchCommands(query, hasEngagementCtx);

  const allItems: Array<{ kind: "result" | "command" | "recent"; payload: PaletteResult | Command | Recent }> =
    query.trim()
      ? [
          ...results.map((r) => ({ kind: "result" as const, payload: r })),
          ...commandMatches.map((c) => ({ kind: "command" as const, payload: c })),
        ]
      : [
          ...commandMatches.map((c) => ({ kind: "command" as const, payload: c })),
          ...recents.map((r) => ({ kind: "recent" as const, payload: r })),
        ];

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMode("search");
    setActiveCommand(null);
    setSelected(0);
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
        setQuery("");
        setSelected(0);
      }
      if (e.key === "Escape" && open) {
        if (mode === "form") { setMode("search"); setActiveCommand(null); }
        else close();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, mode, close]);

  useEffect(() => { if (open && mode === "search") setTimeout(() => inputRef.current?.focus(), 10); }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    getRecents().then(setRecents).catch(() => setRecents([]));
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) { setResults([]); return; }
      startSearch(async () => {
        try { setResults(await searchAll(query)); } catch { setResults([]); }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { if (selected >= allItems.length) setSelected(0); }, [allItems.length, selected]);

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => (s + 1) % Math.max(allItems.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => (s - 1 + allItems.length) % Math.max(allItems.length, 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = allItems[selected];
      if (!item) return;
      if (item.kind === "result") { router.push((item.payload as PaletteResult).href); close(); }
      else if (item.kind === "recent") { router.push(resolveRecentHref(item.payload as Recent)); close(); }
      else if (item.kind === "command") {
        const cmd = item.payload as Command;
        setActiveCommand(cmd);
        setMode("form");
      }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-[#e0e0e0] bg-white"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        {mode === "search" ? (
          <>
            <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-4 py-3">
              <Search size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search or run a command..."
                aria-label="Palette search"
                className="flex-1 text-[14px] outline-none placeholder:text-[#aaa]"
              />
              <kbd className="rounded border border-[#e0e0e0] px-1.5 py-0.5 text-[10px] text-[#888]">ESC</kbd>
            </div>
            <div ref={listRef} className="max-h-[360px] overflow-y-auto" role="listbox" aria-live="polite">
              <PaletteList
                items={allItems}
                selected={selected}
                onSelect={(i) => setSelected(i)}
                onActivate={(i) => {
                  setSelected(i);
                  onKeyDown({ key: "Enter", preventDefault() {} } as React.KeyboardEvent);
                }}
              />
            </div>
          </>
        ) : (
          activeCommand ? (
            <CommandForm
              command={activeCommand}
              ctx={ctx}
              onCancel={() => { setMode("search"); setActiveCommand(null); }}
              onSuccess={() => { close(); }}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

function resolveRecentHref(r: Recent): string {
  switch (r.kind) {
    case "page": return r.ref;
    case "engagement": return `/clients/${r.ref}`;
    case "project": return `/projects/${r.ref}`;
    case "contact": return `/contacts/${r.ref}`;
    case "invoice": return `/invoices?invoiceId=${r.ref}`;
    case "task": return `/tasks?taskId=${r.ref}`;
    case "doc": return `/docs/${r.ref}`;
    default: return "/";
  }
}

// Stubs — full implementations come in Tasks 10 and 11.
function PaletteList(_: {
  items: Array<{ kind: "result" | "command" | "recent"; payload: PaletteResult | Command | Recent }>;
  selected: number;
  onSelect: (i: number) => void;
  onActivate: (i: number) => void;
}) {
  return <div className="p-3 text-[12px] text-[#888]">Results render here (Task 10).</div>;
}

function CommandForm(_: { command: Command; ctx: ReturnType<typeof resolveRouteContext>; onCancel: () => void; onSuccess: () => void; }) {
  return <div className="p-3 text-[12px] text-[#888]">Command form renders here (Task 11).</div>;
}
