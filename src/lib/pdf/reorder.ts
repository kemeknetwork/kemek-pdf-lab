/**
 * Rebuild `current` in the order `orderedIds` names, reusing the SAME page
 * objects rather than whatever the caller handed in. Callers (the drag grid,
 * reverse, alternate-and-mix) only decide the order; the page data — rotation,
 * label, annotations, and any field added later — always comes from the store,
 * so no caller can drop a field by rebuilding pages from a field list.
 *
 * Returns null when `orderedIds` is not a permutation of `current`'s ids (a
 * stale or partial order), so the caller refuses it instead of losing pages.
 */
export function resolveOrder<T extends { id: string }>(
  current: readonly T[],
  orderedIds: readonly string[]
): T[] | null {
  if (orderedIds.length !== current.length) return null;
  const byId = new Map(current.map((p) => [p.id, p]));
  const next: T[] = [];
  for (const id of orderedIds) {
    const page = byId.get(id);
    if (!page) return null;
    byId.delete(id); // a repeated id would otherwise duplicate one page and drop another
    next.push(page);
  }
  return next;
}
