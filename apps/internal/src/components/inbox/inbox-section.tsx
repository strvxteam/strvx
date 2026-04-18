"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { InboxItem } from "@/lib/inbox-data";
import { InboxItemRenderer } from "./inbox-item";

export function InboxSection({
  title,
  items,
  emptyMessage,
  collapsible = false,
  startCollapsed = false,
}: {
  title: string;
  items: InboxItem[];
  emptyMessage: string;
  collapsible?: boolean;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  const count = items.length;

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
      <header className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {collapsible ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-[13px] font-semibold text-[#333]"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${open ? "" : "-rotate-90"}`}
              />
              {title}
            </button>
          ) : (
            <h2 className="text-[13px] font-semibold text-[#333]">{title}</h2>
          )}
          <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 text-[11px] text-[#555]">
            {count}
          </span>
        </div>
      </header>
      {open &&
        (count === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-[#bbb]">{emptyMessage}</div>
        ) : (
          <div>
            {items.map((it) => (
              <InboxItemRenderer key={`${it.kind}-${it.id}`} item={it} />
            ))}
          </div>
        ))}
    </section>
  );
}
