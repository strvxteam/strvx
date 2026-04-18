"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Search, ArrowRight, ChevronRight, FileText as FileIcon,
  Building2, User, Kanban, Receipt, BookOpen, Box, Hash,
  CheckSquare as CheckSquareIcon,
} from "lucide-react";
import type { PaletteResult, PaletteGroupKey } from "@/app/actions/palette";
import {
  searchAll,
  createTaskInline,
  createEngagementInline,
  createContactInline,
  logInteractionInline,
  addNextActionInline,
  addFollowupLinkInline,
} from "@/app/actions/palette";
import { getRecents, type UserRecent } from "@/app/actions/ui-state";
import { matchCommands, type Command } from "./commands";
import { resolveRouteContext } from "@/lib/route-context";
import { PaletteInlineForm } from "./palette-form";
import { toast } from "sonner";

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
  const dialogRef = useRef<HTMLDivElement>(null);
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
    getRecents()
      .then((r) => { setRecents(r); setSelected(0); })
      .catch(() => { setRecents([]); setSelected(0); });
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) { setResults([]); setSelected(0); return; }
      startSearch(async () => {
        try { setResults(await searchAll(query)); setSelected(0); }
        catch { setResults([]); setSelected(0); }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>("input, button, [tabindex]:not([tabindex='-1'])");
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      prev?.focus?.();
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const groupIndex = Number(e.key) - 1;
      const groupStart = findNthGroupStart(allItems, groupIndex);
      if (groupStart !== -1) setSelected(groupStart);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const item = allItems[selected];
      if (item?.kind === "result") window.open((item.payload as PaletteResult).href, "_blank");
      else if (item?.kind === "recent") window.open(resolveRecentHref(item.payload as Recent), "_blank");
      return;
    }
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
        ref={dialogRef}
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

function findNthGroupStart(items: Array<{ kind: "result" | "command" | "recent"; payload: unknown }>, n: number): number {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const key = items[i].kind === "result"
      ? `r:${(items[i].payload as { group: string }).group}`
      : items[i].kind === "command" ? "commands" : "recent";
    if (!seen.has(key)) {
      seen.add(key);
      if (seen.size - 1 === n) return i;
    }
  }
  return -1;
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
type ListItem = { kind: "result" | "command" | "recent"; payload: PaletteResult | Command | Recent };

function PaletteList({ items, selected, onSelect, onActivate }: {
  items: ListItem[];
  selected: number;
  onSelect: (i: number) => void;
  onActivate: (i: number) => void;
}) {
  if (items.length === 0) {
    return <div className="px-3 py-6 text-center text-[13px] text-[#aaa]">No results</div>;
  }

  const groups: Array<{ title: string; range: [number, number] }> = [];
  let cursor = 0;
  function pushGroup(title: string, predicate: (it: ListItem) => boolean) {
    const start = cursor;
    while (cursor < items.length && predicate(items[cursor])) cursor++;
    if (cursor > start) groups.push({ title, range: [start, cursor] });
  }
  if (items[0]?.kind === "result") {
    for (const key of GROUP_ORDER) {
      pushGroup(GROUP_LABELS[key], (it) => it.kind === "result" && (it.payload as PaletteResult).group === key);
    }
    pushGroup("Commands", (it) => it.kind === "command");
  } else {
    pushGroup("Commands", (it) => it.kind === "command");
    pushGroup("Recent", (it) => it.kind === "recent");
  }

  return (
    <>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="border-t border-[#f0f0f0] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888] first:border-t-0">
            {g.title}
          </div>
          {items.slice(g.range[0], g.range[1]).map((it, offset) => {
            const index = g.range[0] + offset;
            const isSel = selected === index;
            return (
              <button
                key={itemKey(it, index)}
                data-selected={isSel}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onActivate(index)}
                role="option"
                aria-selected={isSel}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${isSel ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"}`}
              >
                {renderIcon(it)}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[#222]">{renderLabel(it)}</div>
                  {renderSublabel(it) && (
                    <div className="truncate text-[11px] text-[#888]">{renderSublabel(it)}</div>
                  )}
                </div>
                {it.kind !== "command" && <ArrowRight size={14} strokeWidth={1.5} className="shrink-0 text-[#ccc]" />}
                {it.kind === "command" && <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-[#ccc]" />}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function itemKey(it: ListItem, i: number): string {
  if (it.kind === "command") return `c-${(it.payload as Command).id}`;
  if (it.kind === "result") return `r-${(it.payload as PaletteResult).group}-${(it.payload as PaletteResult).id}`;
  return `h-${(it.payload as Recent).id}-${i}`;
}

function renderIcon(it: ListItem) {
  if (it.kind === "command") {
    const Icon = (it.payload as Command).icon;
    return <Icon size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />;
  }
  const kind = it.kind === "result" ? (it.payload as PaletteResult).group : (it.payload as Recent).kind;
  const map: Record<string, typeof FileIcon> = {
    pages: Hash, engagements: Building2, contacts: User, tasks: CheckSquareIcon,
    projects: Kanban, invoices: Receipt, docs: BookOpen, skills: Box,
    page: Hash, engagement: Building2, contact: User, task: CheckSquareIcon,
    project: Kanban, invoice: Receipt, doc: BookOpen,
  };
  const Icon = (map as Record<string, typeof FileIcon>)[kind] ?? FileIcon;
  return <Icon size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />;
}

function renderLabel(it: ListItem): string {
  if (it.kind === "command") return (it.payload as Command).label;
  if (it.kind === "result") return (it.payload as PaletteResult).label;
  return (it.payload as Recent).label;
}

function renderSublabel(it: ListItem): string | null {
  if (it.kind === "command") return null;
  if (it.kind === "result") return (it.payload as PaletteResult).sublabel ?? null;
  return null;
}

type FormConfig = {
  title: string;
  fields: Parameters<typeof PaletteInlineForm>[0]["fields"];
  submit: (values: Record<string, string>, ctx: ReturnType<typeof resolveRouteContext>) => Promise<{ success: true } | { success: false; error: string }>;
  successToast: string;
};

function buildFormConfig(cmd: Command, ctx: ReturnType<typeof resolveRouteContext>): FormConfig | null {
  switch (cmd.id) {
    case "new-task":
      return {
        title: "New task",
        fields: [
          { key: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Follow up Acme" },
          { key: "dueDate", label: "Due", type: "date" },
        ],
        submit: async (v) => {
          const res = await createTaskInline({
            title: v.title,
            dueDate: v.dueDate || undefined,
            engagementId: ctx?.kind === "engagement" ? ctx.id : undefined,
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Task created",
      };
    case "new-engagement":
      return {
        title: "New engagement",
        fields: [
          { key: "companyName", label: "Company", type: "text", required: true },
          { key: "name", label: "Engagement name", type: "text", required: true, placeholder: "e.g. Q2 rebuild" },
        ],
        submit: async (v) => {
          const res = await createEngagementInline({ companyName: v.companyName, name: v.name });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Engagement created",
      };
    case "new-contact":
      return {
        title: "New contact",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "text" },
          { key: "companyId", label: "Company ID", type: "text", required: true, placeholder: "Paste company UUID" },
        ],
        submit: async (v) => {
          const res = await createContactInline({ name: v.name, email: v.email || undefined, companyId: v.companyId });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Contact created",
      };
    case "log-interaction":
      if (ctx?.kind !== "engagement") return null;
      return {
        title: "Log interaction",
        fields: [
          {
            key: "type", label: "Type", type: "select", required: true,
            options: [
              { value: "note", label: "Note" },
              { value: "meeting", label: "Meeting" },
            ],
          },
          { key: "content", label: "Content", type: "textarea", required: true, rows: 3 },
        ],
        submit: async (v) => {
          const res = await logInteractionInline({
            engagementId: ctx.id,
            type: v.type as "note" | "meeting",
            content: v.content,
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Interaction logged",
      };
    case "add-next-action":
      if (ctx?.kind !== "engagement") return null;
      return {
        title: "Add next action",
        fields: [
          { key: "description", label: "Description", type: "text", required: true },
          { key: "dueDate", label: "Due", type: "date" },
        ],
        submit: async (v) => {
          const res = await addNextActionInline({
            engagementId: ctx.id, description: v.description, dueDate: v.dueDate || undefined,
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Next action added",
      };
    case "add-followup-link":
      if (ctx?.kind !== "engagement") return null;
      return {
        title: "Mint follow-up meeting link",
        fields: [
          {
            key: "meetingType", label: "Meeting type", type: "select", required: true,
            options: [
              { value: "proposal", label: "Proposal" },
              { value: "revision", label: "Revision" },
              { value: "in_person", label: "In person" },
            ],
          },
        ],
        submit: async (v) => {
          const res = await addFollowupLinkInline({
            engagementId: ctx.id,
            meetingType: v.meetingType as "proposal" | "revision" | "in_person",
          });
          return res.success ? { success: true } : { success: false, error: res.error };
        },
        successToast: "Follow-up link minted",
      };
    case "new-invoice":
      // No inline form — this command routes to /invoices/new (existing multi-step flow).
      // Return null; CommandForm will render a placeholder with a "Go to invoice builder" CTA.
      return null;
    case "pin-current":
    case "unpin-current":
    case "go-settings":
    case "sign-out":
      return null;
  }
  return null;
}

function CommandForm({ command, ctx, onCancel, onSuccess }: {
  command: Command;
  ctx: ReturnType<typeof resolveRouteContext>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const cfg = buildFormConfig(command, ctx);
  if (!cfg) {
    return (
      <div className="p-4 text-[13px] text-[#555]">
        <p>{command.label} — not yet implemented in palette.</p>
        <button onClick={onCancel} className="mt-3 text-[12px] text-[#888] underline">Back</button>
      </div>
    );
  }
  return (
    <PaletteInlineForm
      title={cfg.title}
      fields={cfg.fields}
      onCancel={onCancel}
      onSubmit={(v) => cfg.submit(v, ctx)}
      onSuccess={() => { toast.success(cfg.successToast); onSuccess(); }}
    />
  );
}
