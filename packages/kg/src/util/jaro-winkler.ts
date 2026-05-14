/**
 * Jaro-Winkler string similarity.
 *
 * Pure byte-comparison: callers should pre-normalize (lowercase, strip
 * diacritics, etc.) before passing strings in. No dependencies.
 *
 * Reference values (used in tests):
 *   jaroWinkler("MARTHA", "MARHTA") ≈ 0.961
 *   jaroWinkler("DWAYNE", "DUANE")  ≈ 0.840
 *   jaroWinkler("CRATE",  "TRACE")  ≈ 0.733
 *   jaroWinkler("",       "")       === 1
 *   jaroWinkler("a",      "")       === 0
 *
 * Algorithm (Winkler 1990):
 *   1. Jaro distance = (m/|s1| + m/|s2| + (m - t/2)/m) / 3
 *      where m = matching characters, t = transpositions, with the matching
 *      window = max(0, floor(max(|s1|,|s2|)/2) - 1).
 *   2. Jaro-Winkler = jaro + L * p * (1 - jaro)
 *      where L = length of common prefix (capped at 4), p = scaling factor
 *      (default 0.1; never use p > 0.25 — breaks the [0,1] bound).
 *
 * @param a First string.
 * @param b Second string.
 * @param p Prefix scaling factor in [0, 0.25]. Default 0.1.
 * @returns Similarity in [0, 1]. 1 = identical, 0 = no matching characters.
 */
export function jaroWinkler(a: string, b: string, p: number = 0.1): number {
  if (p < 0 || p > 0.25) {
    throw new Error(
      `jaroWinkler: prefix scaling factor must be in [0, 0.25] (got ${p})`,
    );
  }
  // Both empty → identical by convention.
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const j = jaro(a, b);
  if (j === 0) return 0;

  // Common prefix length, capped at 4 per Winkler's original formulation.
  const prefixCap = Math.min(4, Math.min(a.length, b.length));
  let prefix = 0;
  for (let i = 0; i < prefixCap; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return j + prefix * p * (1 - j);
}

function jaro(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  // Matching window: max distance two characters can be apart and still match.
  const matchWindow = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);

  const aMatched = new Array<boolean>(la).fill(false);
  const bMatched = new Array<boolean>(lb).fill(false);

  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(i + matchWindow + 1, lb);
    for (let k = lo; k < hi; k++) {
      if (bMatched[k]) continue;
      if (a[i] !== b[k]) continue;
      aMatched[i] = true;
      bMatched[k] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions: walk matched pairs in order and count mismatches.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const halfTranspositions = transpositions / 2;

  return (
    (matches / la +
      matches / lb +
      (matches - halfTranspositions) / matches) /
    3
  );
}
