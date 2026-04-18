"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Columns3,
  BookUser,
  CheckSquare,
  FolderKanban,
  CalendarDays,
  Users,
  FileText,
  Wallet,
  BookOpen,
  Target,
  FolderOpen,
  Wrench,
  Menu,
  X,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Handshake,
  Brain,
  Boxes,
  ScrollText,
  Bot,
  ShieldAlert,
  LayoutTemplate,
  Rocket,
  GitPullRequest,
  Zap,
  Server,
  Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NavSection = {
  label: string;
  icon: React.ElementType;
  items: { href: string; label: string; icon: React.ElementType }[];
};

const navSections: NavSection[] = [
  {
    label: "CRM",
    icon: LayoutDashboard,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Columns3 },
      { href: "/clients", label: "Clients", icon: BookUser },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Partners",
    icon: Handshake,
    items: [
      { href: "/partners/pipeline", label: "Pipeline", icon: Columns3 },
      { href: "/partners", label: "Directory", icon: Handshake },
      { href: "/partners/invoices", label: "Invoices", icon: FileText },
    ],
  },
  {
    label: "Projects",
    icon: FolderKanban,
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/availability", label: "Availability", icon: Users },
    ],
  },
  {
    label: "Development",
    icon: Rocket,
    items: [
      { href: "/development", label: "Overview", icon: Activity },
      { href: "/development/deployments", label: "Deployments", icon: Rocket },
      { href: "/development/pull-requests", label: "Pull Requests", icon: GitPullRequest },
      { href: "/development/actions", label: "Actions", icon: Zap },
      { href: "/development/monitoring", label: "Monitoring", icon: Wrench },
      { href: "/development/repos", label: "Repos", icon: Server },
    ],
  },
  {
    label: "Finance",
    icon: Wallet,
    items: [
      { href: "/finances", label: "Finances", icon: Wallet },
      { href: "/invoices", label: "Invoices", icon: FileText },
    ],
  },
  {
    label: "Goals",
    icon: Target,
    items: [
      { href: "/goals", label: "Goals", icon: Target },
    ],
  },
  {
    label: "Knowledge",
    icon: BookOpen,
    items: [
      { href: "/assets", label: "Assets", icon: FolderOpen },
      { href: "/docs", label: "Docs", icon: BookOpen },
    ],
  },
  {
    label: "Skills & Agents",
    icon: Boxes,
    items: [
      { href: "/skills", label: "Library", icon: Boxes },
      { href: "/skills/components", label: "Components", icon: Brain },
      { href: "/skills/rules", label: "Rules", icon: ScrollText },
      { href: "/skills/patterns", label: "Patterns", icon: LayoutTemplate },
      { href: "/skills/corrections", label: "Corrections", icon: ShieldAlert },
      { href: "/skills/agents", label: "Agents", icon: Bot },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    // Auto-open the section containing the current page
    const initial = new Set<string>();
    for (const section of navSections) {
      if (section.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))) {
        initial.add(section.label);
      }
    }
    return initial;
  });

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }, [router]);

  // Close sidebar on route change (mobile)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Auto-open section when navigating
  useEffect(() => {
    const matchingSections = navSections
      .filter((section) =>
        section.items.some(
          (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
        ),
      )
      .map((s) => s.label);
    if (matchingSections.length === 0) return;
    const id = requestAnimationFrame(() => {
      setOpenSections((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const label of matchingSections) {
          if (!next.has(label)) {
            next.add(label);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => { setMobileOpen(false); }, []);

  const toggleSection = (label: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between px-3">
        <Link href="/dashboard" className="text-[17px] font-bold tracking-tight text-[#111]" onClick={closeMobile}>
          {collapsed ? "s" : "strvx"}
        </Link>
        <div className="flex items-center gap-1">
          {/* Collapse toggle — desktop only */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-[#999] transition-colors hover:bg-[#f0f0f0] hover:text-[#555] md:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
          {/* Close — mobile only */}
          <button
            type="button"
            onClick={closeMobile}
            className="rounded-md p-1.5 text-[#555] transition-colors hover:bg-[#f0f0f0] md:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2">
        {navSections.map((section) => {
          const isOpen = openSections.has(section.label);
          const hasActive = section.items.some(
            (item) => pathname === item.href || pathname.startsWith(item.href + "/")
          );
          const SectionIcon = section.icon;

          return (
            <div key={section.label} className="mb-1">
              {/* Section header button */}
              <button
                type="button"
                onClick={() => collapsed ? setCollapsed(false) : toggleSection(section.label)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                  hasActive && !isOpen
                    ? "bg-[#f0f0f0] text-[#111]"
                    : "text-[#555] hover:bg-[#f5f5f5]"
                }`}
              >
                <SectionIcon size={16} strokeWidth={1.5} className={hasActive ? "text-[#111]" : "text-[#888]"} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-[13px] font-semibold">{section.label}</span>
                    <ChevronDown
                      size={14}
                      className={`text-[#aaa] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>

              {/* Child items — animated expand */}
              {!collapsed && isOpen && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-[#e8e8e8] pl-3">
                  {section.items.map((item) => {
                    const hasSubItems = section.items.some(
                      (other) => other !== item && other.href.startsWith(item.href + "/")
                    );
                    const isActive = hasSubItems
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMobile}
                        className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                          isActive
                            ? "bg-[#111] font-medium text-white"
                            : "text-[#666] hover:bg-[#f0f0f0] hover:text-[#222]"
                        }`}
                      >
                        <item.icon size={14} strokeWidth={1.5} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="mt-auto border-t border-[#e8e8e8] px-2 pt-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-[#888] transition-colors hover:bg-[#f5f5f5] hover:text-[#555]"
        >
          <LogOut size={15} strokeWidth={1.5} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md border border-[#e0e0e0] bg-white p-2 shadow-sm transition-colors hover:bg-[#f5f5f5] md:hidden"
        aria-label="Open sidebar"
      >
        <Menu size={20} strokeWidth={1.5} />
      </button>

      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 flex-col overflow-hidden border-r border-[#e0e0e0] bg-white py-4 transition-all duration-200 md:flex ${
          collapsed ? "w-[60px]" : "w-[250px]"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={closeMobile} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col overflow-y-auto bg-white py-4 shadow-xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
