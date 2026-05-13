"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchEmailsAction } from "../_actions";

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{
    threadId: string;
    subject: string | null;
    snippet: string | null;
    fromEmail: string;
    sentAt: string;
  }> | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    startTransition(async () => {
      const result = await searchEmailsAction(q);
      setHits(result);
    });
  }

  return (
    <div className="relative">
      <form onSubmit={handleSubmit}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full px-3 py-1.5 rounded-md border text-[13px] outline-none"
          style={{ borderColor: "#e0e0e0", background: "#ffffff" }}
        />
      </form>
      {hits && hits.length > 0 && (
        <div
          className="absolute top-full mt-1 left-0 right-0 z-10 rounded-md border shadow-sm max-h-96 overflow-auto"
          style={{ borderColor: "#e0e0e0", background: "#ffffff", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
        >
          {hits.map((h) => (
            <button
              key={h.threadId + h.sentAt}
              type="button"
              onClick={() => {
                router.push(`/agent-inbox?thread=${h.threadId}`);
                setHits(null);
                setQuery("");
              }}
              className="block w-full text-left px-3 py-2 border-b hover:bg-[#f5f5f5]"
              style={{ borderColor: "#f0f0f0" }}
            >
              <div className="text-[13px] font-medium truncate">
                {h.subject || "(no subject)"}
              </div>
              <div className="text-[11px] truncate" style={{ color: "#888" }}>
                {h.fromEmail} · {h.snippet?.slice(0, 80) ?? ""}
              </div>
            </button>
          ))}
        </div>
      )}
      {hits && hits.length === 0 && !pending && (
        <div
          className="absolute top-full mt-1 left-0 right-0 z-10 rounded-md border px-3 py-2 text-[12px]"
          style={{ borderColor: "#e0e0e0", background: "#ffffff", color: "#888" }}
        >
          No results.
        </div>
      )}
    </div>
  );
}
