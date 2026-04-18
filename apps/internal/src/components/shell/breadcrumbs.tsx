import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { resolveEntityLabel } from "@/lib/entity-label";
import { resolveRouteContext } from "@/lib/route-context";

type Crumb = { label: string; href?: string };

export async function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = await buildCrumbs(pathname);
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-[12px] text-[#777]">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} strokeWidth={1.5} className="text-[#bbb]" />}
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-[#222]">{c.label}</Link>
            ) : (
              <span className={last ? "text-[#222] font-medium" : undefined}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

async function buildCrumbs(pathname: string): Promise<Crumb[]> {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    href += "/" + seg;
    if (seg === "clients" && i === 0) { crumbs.push({ label: "Clients", href: "/clients" }); continue; }
    if (seg === "projects" && i === 0) { crumbs.push({ label: "Projects", href: "/projects" }); continue; }
    if (seg === "contacts" && i === 0) { crumbs.push({ label: "Contacts", href: "/contacts" }); continue; }
    const ctx = resolveRouteContext(href);
    if (ctx && ctx.id === seg) {
      const label = await resolveEntityLabel(ctx.kind, ctx.id);
      crumbs.push({ label: label ?? seg, href });
      continue;
    }
    crumbs.push({ label: titleCase(seg) });
  }
  return crumbs;
}

function titleCase(s: string): string {
  return s.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
