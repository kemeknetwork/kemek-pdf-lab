/**
 * Interleave two lists into one: A's first item, then B's first, then A's second,
 * and so on, with any leftover tail of the longer list appended. Pure array-zip
 * over opaque items — the caller maps the result back to a page order.
 *
 * The simplex-scanner fix: scan every front into document A and every back into
 * document B. A duplex job split across two single-sided passes often has the
 * backs fed bottom-up (last sheet first), so the back stack reads in reverse page
 * order — pass `reverseB` to flip it so front N pairs with back N.
 *
 * Stable (preserves each list's internal order) and non-mutating (`reverseB`
 * copies before reversing).
 */
export function interleave<T>(a: readonly T[], b: readonly T[], reverseB = false): T[] {
  const second = reverseB ? [...b].reverse() : b;
  const out: T[] = [];
  const max = Math.max(a.length, second.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < second.length) out.push(second[i]);
  }
  return out;
}
