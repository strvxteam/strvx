/**
 * Deterministic slug generation. Lowercase, hyphenated, ASCII-only.
 * Collisions are not auto-disambiguated here — the caller passes a stable
 * fallback (typically the row id's first 8 chars) when names collide.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function personSlug(name: string): string {
  return slugify(name) || "unknown";
}

export function companySlug(name: string): string {
  // strip common corporate suffixes for a cleaner short slug
  const cleaned = name.replace(
    /\b(inc|corp|llc|ltd|gmbh|co|company)\.?\b/gi,
    "",
  );
  return slugify(cleaned) || slugify(name) || "unknown-co";
}
