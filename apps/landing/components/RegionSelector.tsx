"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const regions = [
  { label: "USA", href: "/" },
  { label: "Government", href: "/government" },
  { label: "Middle East", href: "/middle-east" },
];

export default function RegionSelector() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#030303]/90 backdrop-blur-md border-b border-white/[0.04]">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-1 px-4 py-1.5">
        {regions.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`text-[10px] tracking-[0.1em] uppercase px-3 py-1 rounded-sm transition-all duration-200 ${
              isActive(href)
                ? "text-white bg-white/[0.08]"
                : "text-[#555] hover:text-[#999]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
