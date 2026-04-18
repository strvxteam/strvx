import { cache } from "react";
import { getEngagement, getProject, getContact } from "./queries";

type EntityKind = "engagement" | "project" | "contact";

export const resolveEntityLabel = cache(
  async (kind: EntityKind, id: string): Promise<string | null> => {
    try {
      if (kind === "engagement") {
        const e = await getEngagement(id);
        return e?.companyName ?? null;
      }
      if (kind === "project") {
        const p = await getProject(id);
        return p?.name ?? null;
      }
      if (kind === "contact") {
        const c = await getContact(id);
        return c?.name ?? null;
      }
    } catch {
      return null;
    }
    return null;
  },
);
