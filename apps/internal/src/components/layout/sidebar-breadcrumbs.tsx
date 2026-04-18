"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { resolveRouteContext } from "@/lib/route-context";
import { resolveEntityLabelAction } from "@/app/actions/ui-state";

type Crumb = { label: string; href?: string };

export function SidebarBreadcrumbs() {
  const pathname = usePathname() ?? "/";
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const labelCache = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const segs = pathname.split("?")[0].split("/").filter(Boolean);
      const out: Crumb[] = [];
      let href = "";
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        href += "/" + seg;
        if (i === 0) {
          const label = labelForTopLevel(seg);
          if (label) {
            out.push({ label, href });
            continue;
          }
        }
        const ctx = resolveRouteContext(href);
        if (ctx && ctx.id === seg) {
          const cacheKey = `${ctx.kind}:${ctx.id}`;
          let label = labelCache.current.get(cacheKey);
          if (label === undefined) {
            label = await resolveEntityLabelAction(ctx.kind, ctx.id);
            labelCache.current.set(cacheKey, label);
          }
          out.push({ label: label ?? seg, href });
          continue;
        }
        out.push({ label: titleCase(seg) });
      }
      if (!cancelled) setCrumbs(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-[12px] text-[#777]">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} strokeWidth={1.5} className="text-[#bbb]" />}
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-[#222]">
                {c.label}
              </Link>
            ) : (
              <span className={last ? "text-[#222] font-medium" : undefined}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function labelForTopLevel(seg: string): string | null {
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    clients: "Clients",
    contacts: "Contacts",
    projects: "Projects",
    tasks: "Tasks",
    finances: "Finances",
    invoices: "Invoices",
    calendar: "Calendar",
    goals: "Goals",
    docs: "Docs",
    assets: "Assets",
    skills: "Skills",
    development: "Development",
  };
  return map[seg] ?? null;
}

function titleCase(s: string): string {
  return s
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
