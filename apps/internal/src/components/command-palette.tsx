"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Plus, Users, FileText, CheckSquare } from "lucide-react";
import { searchAll, getRecentEngagementsAction } from "@/app/actions";
import { CreateEngagementForm } from "@/components/create-engagement-form";

type SearchResult = {
  id: string;
  label: string;
  sublabel: string;
  href: string;
  type: "engagement" | "contact";
};

const QUICK_ACTIONS = [
  {
    id: "new-engagement",
    label: "New engagement",
    icon: Plus,
  },
  {
    id: "new-contact",
    label: "New contact",
    icon: Users,
  },
  {
    id: "new-task",
    label: "New task",
    icon: CheckSquare,
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentEngagements, setRecentEngagements] = useState<SearchResult[]>([]);
  const [, startSearch] = useTransition();
  const [showNewEngagement, setShowNewEngagement] = useState(false);

  const totalItems = query.trim()
    ? results.length + QUICK_ACTIONS.length
    : QUICK_ACTIONS.length + recentEngagements.length;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        if (!open) {
          setQuery("");
          setSelectedIndex(0);
        }
      }
      if (e.key === "Escape" && open) {
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Use a small timeout to ensure the dialog is rendered
      const timer = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Load recent engagements when palette opens
  useEffect(() => {
    if (open) {
      startSearch(async () => {
        try {
          const data = await getRecentEngagementsAction();
          setRecentEngagements(
            data.map((eng) => ({
              id: eng.id,
              label: eng.companyName,
              sublabel: eng.name,
              href: `/clients/${eng.id}`,
              type: "engagement" as const,
            }))
          );
        } catch {
          setRecentEngagements([]);
        }
      });
    }
  }, [open]);

  // Search with debounce
  useEffect(() => {
    const debounce = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        try {
          const data = await searchAll(query);
          setResults(
            data.map((eng) => ({
              id: eng.id,
              label: eng.companyName,
              sublabel: eng.name,
              href: `/clients/${eng.id}`,
              type: "engagement" as const,
            }))
          );
        } catch {
          setResults([]);
        }
      });
    }, 200);
    return () => clearTimeout(debounce);
  }, [query]);

  function handleKeyNavigation(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(selectedIndex);
    }
  }

  function selectItem(index: number) {
    // Quick actions come first when there's no query, results come first when searching
    if (query.trim()) {
      if (index < results.length) {
        router.push(results[index].href);
        close();
      } else {
        handleQuickAction(QUICK_ACTIONS[index - results.length].id);
      }
    } else {
      if (index < QUICK_ACTIONS.length) {
        handleQuickAction(QUICK_ACTIONS[index].id);
      } else {
        const result = recentEngagements[index - QUICK_ACTIONS.length];
        if (result) {
          router.push(result.href);
          close();
        }
      }
    }
  }

  function handleQuickAction(actionId: string) {
    switch (actionId) {
      case "new-engagement":
        close();
        setShowNewEngagement(true);
        break;
      case "new-contact":
        close();
        router.push("/clients");
        break;
      case "new-task":
        close();
        router.push("/dashboard");
        break;
    }
  }

  // Build ordered display sections
  const sections: React.ReactNode[] = [];

  if (open) {
    if (query.trim()) {
      // Show search results first, then quick actions
      if (results.length > 0) {
        sections.push(
          <div key="results">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Results
            </div>
            {results.map((result, i) => (
              <button
                key={result.id}
                data-selected={selectedIndex === i}
                onClick={() => {
                  router.push(result.href);
                  close();
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  selectedIndex === i ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"
                }`}
              >
                <FileText size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[#222]">
                    {result.label}
                  </div>
                  <div className="text-[11px] text-[#888]">{result.sublabel}</div>
                </div>
                <ArrowRight size={14} strokeWidth={1.5} className="shrink-0 text-[#ccc]" />
              </button>
            ))}
          </div>
        );
      } else {
        sections.push(
          <div key="no-results" className="px-3 py-6 text-center text-[13px] text-[#aaa]">
            No results found for &ldquo;{query}&rdquo;
          </div>
        );
      }

      sections.push(
        <div key="actions-search">
          <div className="border-t border-[#f0f0f0] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Quick Actions
          </div>
          {QUICK_ACTIONS.map((action, i) => {
            const idx = results.length + i;
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                data-selected={selectedIndex === idx}
                onClick={() => handleQuickAction(action.id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  selectedIndex === idx ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
                <span className="text-[13px] text-[#333]">{action.label}</span>
              </button>
            );
          })}
        </div>
      );
    } else {
      // Show quick actions first, then recent engagements
      sections.push(
        <div key="actions-default">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Quick Actions
          </div>
          {QUICK_ACTIONS.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                data-selected={selectedIndex === i}
                onClick={() => handleQuickAction(action.id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  selectedIndex === i ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
                <span className="text-[13px] text-[#333]">{action.label}</span>
              </button>
            );
          })}
        </div>
      );

      if (recentEngagements.length > 0) {
        sections.push(
          <div key="recent">
            <div className="border-t border-[#f0f0f0] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Recent
            </div>
            {recentEngagements.map((result, i) => {
              const idx = QUICK_ACTIONS.length + i;
              return (
                <button
                  key={result.id}
                  data-selected={selectedIndex === idx}
                  onClick={() => {
                    router.push(result.href);
                    close();
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    selectedIndex === idx ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"
                  }`}
                >
                  <FileText size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#222]">
                      {result.label}
                    </div>
                    <div className="text-[11px] text-[#888]">{result.sublabel}</div>
                  </div>
                  <ArrowRight size={14} strokeWidth={1.5} className="shrink-0 text-[#ccc]" />
                </button>
              );
            })}
          </div>
        );
      }
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]"
          onClick={close}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg border border-[#e0e0e0] bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-4 py-3">
              <Search size={16} strokeWidth={1.5} className="shrink-0 text-[#888]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyNavigation}
                placeholder="Search engagements, contacts, or type a command..."
                className="flex-1 text-[14px] text-[#222] outline-none placeholder:text-[#aaa]"
              />
              <kbd className="rounded border border-[#e0e0e0] px-1.5 py-0.5 text-[10px] text-[#888]">
                ESC
              </kbd>
            </div>

            {/* Results list */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto">
              {sections}
            </div>
          </div>
        </div>
      )}
      {showNewEngagement && (
        <CreateEngagementForm onClose={() => setShowNewEngagement(false)} />
      )}
    </>
  );
}

