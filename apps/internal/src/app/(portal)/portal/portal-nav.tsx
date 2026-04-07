"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/projects", label: "Projects" },
  { href: "/portal/invoices", label: "Invoices" },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-1 rounded-lg border border-[#e0e0e0] bg-white p-1">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || (tab.href !== "/portal" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-4 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-[#111] text-white"
                : "text-[#555] hover:bg-[#f5f5f5]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
