"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Columns3,
  BookUser,
  CheckSquare,
  FolderKanban,
  CalendarDays,
  FileText,
  Wallet,
  BookOpen,
  Send,
  Megaphone,
  Target,
  FolderOpen,
  Menu,
  X,
} from "lucide-react";

type NavSection = {
  label: string;
  items: { href: string; label: string; icon: React.ElementType }[];
};

const navSections: NavSection[] = [
  {
    label: "CRM",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Columns3 },
      { href: "/clients", label: "Clients", icon: BookUser },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Projects",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/outreach", label: "Leads", icon: Send },
      { href: "/marketing", label: "Marketing", icon: Megaphone },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finances", label: "Finances", icon: Wallet },
      { href: "/invoices", label: "Invoices", icon: FileText },
    ],
  },
  {
    label: "Goals",
    items: [
      { href: "/goals", label: "Goals", icon: Target },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/assets", label: "Assets", icon: FolderOpen },
      { href: "/docs", label: "Docs", icon: BookOpen },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close sidebar on route change (mobile)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const sidebarContent = (
    <>
      <div className="mb-4 flex items-center justify-between px-2">
        <Link
          href="/dashboard"
          className="text-base font-bold tracking-tight"
          onClick={closeMobile}
        >
          strvx
        </Link>
        {/* Close button visible only on mobile */}
        <button
          type="button"
          onClick={closeMobile}
          className="rounded-md p-1 text-[#555] transition-colors hover:bg-[#f0f0f0] md:hidden"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {navSections.map((section) => (
        <div key={section.label} className="mb-3">
          <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#aaa]">
            {section.label}
          </div>
          <nav className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    isActive
                      ? "bg-[#f0f0f0] font-semibold text-[#111]"
                      : "text-[#555] hover:bg-[#f5f5f5]"
                  }`}
                >
                  <item.icon size={15} strokeWidth={1.5} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md border border-[#e0e0e0] bg-white p-2 shadow-sm transition-colors hover:bg-[#f5f5f5] md:hidden"
        aria-label="Open sidebar"
      >
        <Menu size={20} strokeWidth={1.5} />
      </button>

      {/* Desktop sidebar — always visible at md+ */}
      <aside className="hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-[#e0e0e0] bg-white px-3 py-4 md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile overlay + sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeMobile}
            aria-hidden="true"
          />
          {/* Slide-in sidebar */}
          <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col overflow-y-auto bg-white px-3 py-4 shadow-xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
