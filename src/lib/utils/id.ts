// Unique-id generator. Prefers crypto.randomUUID(), falling back to a Math.random
// pair when it is unavailable: randomUUID() requires a secure context (HTTPS or
// localhost), and the dev server on a tailscale IP over plain HTTP is NOT secure —
// the bare call throws there. This is the ONE place that guard lives; generate ids
// through here rather than re-rolling crypto.randomUUID() at call sites (see the
// secure-context caveat in CLAUDE.md). Collision risk is negligible for the
// in-session document/element ids this produces.

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
