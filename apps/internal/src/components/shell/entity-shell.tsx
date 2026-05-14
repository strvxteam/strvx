import type { ReactNode } from "react";
import { EntityHeader } from "./entity-header";
import { EntityTabs, type Tab } from "./entity-tabs";
import { RightRail, type RightRailData } from "./right-rail";
import { KgRelatedPanel } from "@/components/kg/kg-related-panel";

export async function EntityShell({
  title, subtitle, engagementId, tabs, rightRail, kgEntityId, children,
}: {
  title: string;
  subtitle?: string;
  engagementId: string;
  tabs: Tab[];
  rightRail: RightRailData;
  /** Optional KG node id (e.g. "postgres:engagements:<uuid>"). Renders the
   *  related-entities panel inside the right rail. Safe to omit. */
  kgEntityId?: string;
  children: ReactNode;
}) {
  // NOTE: Breadcrumbs are rendered globally by <SidebarBreadcrumbs /> in
  // the (app) layout — do not render them again here.
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <EntityHeader title={title} subtitle={subtitle} engagementId={engagementId} />
        <EntityTabs tabs={tabs} />
        <div className="min-w-0">{children}</div>
      </div>
      <aside className="w-[280px] shrink-0 border-l border-[#eee] pl-5 text-[13px]">
        <RightRail data={rightRail} embedded />
        {kgEntityId ? <KgRelatedPanel kgId={kgEntityId} /> : null}
      </aside>
    </div>
  );
}
