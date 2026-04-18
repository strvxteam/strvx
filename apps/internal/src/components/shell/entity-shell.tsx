import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";
import { EntityHeader } from "./entity-header";
import { EntityTabs, type Tab } from "./entity-tabs";
import { RightRail, type RightRailData } from "./right-rail";

export async function EntityShell({
  pathname, title, subtitle, engagementId, tabs, rightRail, children,
}: {
  pathname: string;
  title: string;
  subtitle?: string;
  engagementId: string;
  tabs: Tab[];
  rightRail: RightRailData;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <Breadcrumbs pathname={pathname} />
        <EntityHeader title={title} subtitle={subtitle} engagementId={engagementId} />
        <EntityTabs tabs={tabs} />
        <div className="min-w-0">{children}</div>
      </div>
      <RightRail data={rightRail} />
    </div>
  );
}
