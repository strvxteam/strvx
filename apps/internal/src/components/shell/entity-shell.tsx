import type { ReactNode } from "react";
import { EntityHeader } from "./entity-header";
import { EntityTabs, type Tab } from "./entity-tabs";
import { RightRail, type RightRailData } from "./right-rail";
import { KgRelatedPanel } from "@/components/kg/kg-related-panel";
import { resolveBrainSlug } from "@/lib/kg/brain-reader";

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
  // The legacy KG-id shape was `postgres:<table>:<uuid>` (Neo4j). The brain
  // uses slugs like `deals/acme-q4-platform`. Translate at the boundary so
  // callers (clients/[id], contacts/[id]) don't need to know which backing
  // store renders the panel.
  const resolvedKgId = kgEntityId
    ? (await resolveBrainSlug(kgEntityId)) ?? null
    : null;
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <EntityHeader title={title} subtitle={subtitle} engagementId={engagementId} />
        <EntityTabs tabs={tabs} />
        <div className="min-w-0">{children}</div>
      </div>
      <aside className="w-[280px] shrink-0 border-l border-[#eee] pl-5 text-[13px]">
        <RightRail data={rightRail} embedded />
        {resolvedKgId ? <KgRelatedPanel kgId={resolvedKgId} /> : null}
      </aside>
    </div>
  );
}
