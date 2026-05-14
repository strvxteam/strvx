/**
 * UUIDv7 generator — time-sortable 128-bit identifiers.
 *
 * Layout (per draft-peabody-dispatch-new-uuid-format-04 / RFC 9562):
 *   - 48 bits: unix timestamp in milliseconds (most-significant)
 *   - 4 bits : version (constant 0b0111 = 7)
 *   - 12 bits: random (rand_a)
 *   - 2 bits : variant (constant 0b10)
 *   - 62 bits: random (rand_b)
 *
 * Random bytes are drawn from `crypto.getRandomValues`. The leading
 * millisecond timestamp guarantees lexicographic sort order matches
 * generation order at ms resolution — useful for agent memory recall
 * where temporal locality of observations and decisions matters.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-bit ms timestamp into bytes[0..5] (big-endian).
  const ts = Math.max(0, Math.floor(now));
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts >>> 24) & 0xff;
  bytes[3] = (ts >>> 16) & 0xff;
  bytes[4] = (ts >>> 8) & 0xff;
  bytes[5] = ts & 0xff;

  // Version 7 in the high nibble of byte 6, low nibble = random rand_a hi.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant (10xx) in the high two bits of byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return (
    hex(bytes[0]) +
    hex(bytes[1]) +
    hex(bytes[2]) +
    hex(bytes[3]) +
    "-" +
    hex(bytes[4]) +
    hex(bytes[5]) +
    "-" +
    hex(bytes[6]) +
    hex(bytes[7]) +
    "-" +
    hex(bytes[8]) +
    hex(bytes[9]) +
    "-" +
    hex(bytes[10]) +
    hex(bytes[11]) +
    hex(bytes[12]) +
    hex(bytes[13]) +
    hex(bytes[14]) +
    hex(bytes[15])
  );
}

function hex(n: number): string {
  return n.toString(16).padStart(2, "0");
}
