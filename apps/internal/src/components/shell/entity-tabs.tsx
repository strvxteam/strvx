"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { key: string; label: string; href: string };

export function EntityTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex gap-5 border-b border-[#e8e8e8]">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px border-b-2 pb-2 pt-1 text-[13px] ${
              active ? "border-[#111] font-medium text-[#111]" : "border-transparent text-[#777] hover:text-[#333]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
