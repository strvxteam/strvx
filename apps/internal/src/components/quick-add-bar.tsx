"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { quickAdd } from "@/app/actions";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

type Engagement = {
  id: string;
  name: string;
  companyName: string;
};

export function QuickAddBar({
  engagements,
  defaultEngagementId,
}: {
  engagements: Engagement[];
  defaultEngagementId?: string;
}) {
  const [content, setContent] = useState("");
  const [selectedEngagement, setSelectedEngagement] = useState(
    defaultEngagementId || ""
  );
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const clientMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Detect type prefix
  const isAction = content.startsWith("/action ");
  const isMeeting = content.startsWith("/meeting ") || content.startsWith("/call ");

  // Close client menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientMenuRef.current && !clientMenuRef.current.contains(e.target as Node)) {
        setShowClientMenu(false);
      }
    }
    if (showClientMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showClientMenu]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "/" && content === "") {
      setShowTypeMenu(true);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      // Cycle through engagements
      const currentIdx = engagements.findIndex(
        (eng) => eng.id === selectedEngagement
      );
      const nextIdx = (currentIdx + 1) % engagements.length;
      setSelectedEngagement(engagements[nextIdx]?.id || "");
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setShowTypeMenu(false);
    }
  }

  function selectType(type: string) {
    setContent(`/${type} `);
    setShowTypeMenu(false);
    inputRef.current?.focus();
  }

  async function handleSubmit() {
    if (!content.trim() || !selectedEngagement) return;
    setError(null);

    const formData = new FormData();
    formData.set("content", content);
    formData.set("engagementId", selectedEngagement);
    if (dueDate) formData.set("dueDate", dueDate);
    if (scheduledAt) formData.set("scheduledAt", scheduledAt);

    startTransition(async () => {
      try {
        await quickAdd(formData);
        const engName =
          engagements.find((e) => e.id === selectedEngagement)?.companyName ||
          "client";
        toast.success(`Saved for ${engName}`);
        setContent("");
        setDueDate("");
        setScheduledAt("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="fixed bottom-6 left-[252px] right-8 z-50">
      {/* Error */}
      {error && (
        <div className="mb-2 flex justify-center">
          <div className="flex items-center gap-2 rounded-md bg-[#fde8e8] px-3 py-1.5 text-[12px] text-[#c0392b] shadow-sm">
            {error}
            <button
              onClick={handleSubmit}
              className="font-medium underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Type popover — horizontal */}
      {showTypeMenu && (
        <div className="mb-1.5 flex items-center gap-1 rounded-lg border border-border bg-white px-1.5 py-1 shadow-md">
          {[
            { key: "note", label: "Note" },
            { key: "meeting", label: "Meeting" },
            { key: "action", label: "Action" },
            { key: "call", label: "Call" },
            { key: "email", label: "Email" },
            { key: "update", label: "Update" },
            { key: "invoice", label: "Invoice" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => selectType(item.key)}
              className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Main bar */}
      <div className="flex items-center gap-3 rounded-lg border border-[#ddd] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {/* Engagement selector */}
        <div className="relative" ref={clientMenuRef}>
          <button
            type="button"
            onClick={() => setShowClientMenu((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="max-w-[140px] truncate">
              {selectedEngagement
                ? engagements.find((e) => e.id === selectedEngagement)?.companyName || "Select client..."
                : "Select client..."}
            </span>
            <ChevronDown size={12} strokeWidth={1.5} />
          </button>
          {showClientMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-[200px] rounded-lg border border-border bg-white py-1 shadow-lg">
              {engagements.map((eng) => (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => {
                    setSelectedEngagement(eng.id);
                    setShowClientMenu(false);
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-muted ${
                    selectedEngagement === eng.id ? "font-medium text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {eng.companyName}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[#e0e0e0]" />

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (e.target.value === "/") setShowTypeMenu(true);
            else setShowTypeMenu(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type / for note, meeting, or action..."
          className="flex-1 border-none text-sm outline-none placeholder:text-[#bbb]"
          disabled={isPending}
        />

        {/* Due date picker for actions */}
        {isAction && (
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border-none text-[12px] text-[#888] outline-none"
            placeholder="Due date"
          />
        )}

        {/* Scheduled time for meetings */}
        {isMeeting && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="border-none text-[12px] text-[#888] outline-none"
          />
        )}

        <span className="whitespace-nowrap text-[11px] text-[#bbb]">
          Tab: client · Enter: save
        </span>
      </div>
    </div>
  );
}
