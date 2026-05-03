import type { ReactNode } from "react";
import { EntityHeader } from "./entity-header";
import { EntityTabs, type Tab } from "./entity-tabs";
import { RightRail, type RightRailData } from "./right-rail";

export async function EntityShell({
  title, subtitle, engagementId, tabs, rightRail, children,
}: {
  title: string;
  subtitle?: string;
  engagementId: string;
  tabs: Tab[];
  rightRail: RightRailData;
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
      <RightRail data={rightRail} />
    </div>
  );
}
