"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkX } from "lucide-react";
import { getPins, unpinItem, type UserPin } from "@/app/actions/ui-state";

export function PinnedSection({ collapsed }: { collapsed: boolean }) {
  const [pins, setPins] = useState<UserPin[]>([]);

  useEffect(() => {
    getPins().then(setPins).catch(() => setPins([]));
  }, []);

  if (pins.length === 0) return null;

  return (
    <div className="mb-3">
      {!collapsed && (
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#999]">
          Pinned
        </div>
      )}
      {pins.map((p) => (
        <div key={p.id} className="group flex items-center gap-2 px-2">
          <Link
            href={resolvePinHref(p)}
            className="flex-1 rounded-md px-2 py-1.5 text-[13px] text-[#333] hover:bg-[#f0f0f0]"
          >
            {collapsed ? p.label.slice(0, 1) : p.label}
          </Link>
          {!collapsed && (
            <button
              onClick={async () => {
                await unpinItem({ kind: p.kind, ref: p.ref });
                setPins((prev) => prev.filter((x) => x.id !== p.id));
              }}
              aria-label={`Unpin ${p.label}`}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <BookmarkX size={12} className="text-[#999] hover:text-[#c0392b]" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function resolvePinHref(p: UserPin): string {
  switch (p.kind) {
    case "page": return p.ref;
    case "engagement": return `/clients/${p.ref}`;
    case "project": return `/projects/${p.ref}`;
    case "contact": return `/contacts/${p.ref}`;
    case "invoice": return `/invoices?invoiceId=${p.ref}`;
    case "task": return `/tasks?taskId=${p.ref}`;
    case "doc": return `/docs/${p.ref}`;
    default: return "/";
  }
}
