export type RouteContext = {
  kind: "engagement" | "project" | "contact";
  id: string;
};

const PATTERNS: { prefix: string; kind: RouteContext["kind"] }[] = [
  { prefix: "/clients/", kind: "engagement" },
  { prefix: "/projects/", kind: "project" },
  { prefix: "/contacts/", kind: "contact" },
];

export function resolveRouteContext(pathname: string): RouteContext | null {
  const clean = pathname.split("?")[0].replace(/\/+$/, "");
  for (const { prefix, kind } of PATTERNS) {
    if (!clean.startsWith(prefix)) continue;
    const rest = clean.slice(prefix.length);
    if (!rest) return null; // bare list page
    const id = rest.split("/")[0];
    if (!id) return null;
    return { kind, id };
  }
  return null;
}
