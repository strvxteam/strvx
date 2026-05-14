export function entityHref(id: string): string {
  return `/kg/entity/${encodeURIComponent(id)}`;
}
