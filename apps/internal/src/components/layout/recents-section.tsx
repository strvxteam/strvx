"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecents, type UserRecent } from "@/app/actions/ui-state";

export function RecentsSection({ collapsed }: { collapsed: boolean }) {
  const [recents, setRecents] = useState<UserRecent[]>([]);

  useEffect(() => {
    getRecents().then(setRecents).catch(() => setRecents([]));
  }, []);

  if (recents.length === 0) return null;

  return (
    <div className="mt-auto mb-2 border-t border-[#f0f0f0] pt-3">
      {!collapsed && (
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#999]">
          Recent
        </div>
      )}
      {recents.slice(0, collapsed ? 5 : 10).map((r) => (
        <Link
          key={r.id}
          href={resolveRecentHref(r)}
          className="block truncate rounded-md px-3 py-1 text-[12px] text-[#555] hover:bg-[#f0f0f0] hover:text-[#222]"
          title={r.label}
        >
          {collapsed ? r.label.slice(0, 1) : r.label}
        </Link>
      ))}
    </div>
  );
}

function resolveRecentHref(r: UserRecent): string {
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
