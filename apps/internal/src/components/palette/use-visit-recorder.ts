"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordVisit } from "@/app/actions/ui-state";
import { resolveRouteContext } from "@/lib/route-context";

const DEBOUNCE_MS = 500;

function labelForPage(pathname: string): string {
  const seg = pathname.split("?")[0].replace(/^\/+|\/+$/g, "");
  if (!seg) return "Home";
  return seg.split("/").map((s) => s.replace(/-/g, " ")).join(" / ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useVisitRecorder() {
  const pathname = usePathname();
  const lastRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const ctx = resolveRouteContext(pathname);
    const ref = ctx ? ctx.id : pathname;
    const kind = ctx ? ctx.kind : "page";
    const label = ctx ? labelForPage(pathname) : labelForPage(pathname);
    if (lastRef.current === `${kind}:${ref}`) return;
    lastRef.current = `${kind}:${ref}`;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      recordVisit({ kind, ref, label }).catch(() => {});
    }, DEBOUNCE_MS);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [pathname]);
}
