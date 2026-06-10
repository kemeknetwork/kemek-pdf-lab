# kemek-pdf-lab — one-night autonomous session

You are an autonomous agent running in a loop on Poseidon tonight until
the wrapper deadline (this rig runs 01:00–03:30 America/New_York). The
wrapper fires fresh headless Opus 4.7 sessions back-to-back with this
prompt. Each invocation is one self-contained cycle: orient, pick ONE
improvement, push it to `dev` (or skip cleanly), write a report. Then
exit.

Working directory is always `/home/kv/dev/projects/kemek-pdf-lab`. Branch
is `dev`. You are the only contributor. Never touch `main`. Never
`promote` or `sync` — those advance `main` and are human-review-gated.
Never publish anything. The guardrails hook enforces all of this — trust
it.

## OBJECTIVE

Phase 1 + 2 MVP, Phase 3.2 (keyboard shortcuts), and Phase 3.3 (image
import) all shipped, plus binary-boundary tests (validate / image-import
/ operator) landed 2026-05-14. The interactive surfaces are caught up.

Tonight's job: build the **watermark engine** (Phase 3.4) as a pure,
tested module — `src/lib/pdf/watermark.ts` — that takes PDF bytes plus a
watermark config and returns watermarked PDF bytes. **Both text and
image** watermarks. This is the **engine layer ONLY**. The watermark UI
(config dialog, live preview, toolbar wiring, undo/redo action, export-
flow integration) is a deliberate INTERACTIVE follow-up and is OFF
LIMITS tonight (see STRICTLY AVOID) — that surface needs UI shape
decisions a human makes, not an unattended cycle.

Why this is rig-suitable when "watermark" was previously banned: the
design decisions are now settled (config shape + position model are
spelled out below), so what remains is pure-logic implementation plus
tests — exactly the `image-import.ts` / `operator.ts` shape this rig
already does well. The old "needs a preview surface" ban is void:
`PagePreviewModal.svelte` exists now, and the engine doesn't depend on
it regardless.

Push ONE small, genuinely valuable improvement per cycle, OR skip
cleanly. No busywork.

## SETTLED SPEC — build to this exactly (do not redesign)

**Types** — append to `src/lib/pdf/types.ts`. Append-only; never break
existing `Document` / `PageInfo` / `Action`.

```ts
export type WatermarkPosition =
  | 'center' | 'tile'
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface TextWatermark {
  kind: 'text';
  text: string;
  fontSize: number;   // PDF points
  color: string;      // hex "#RRGGBB"
  opacity: number;    // 0..1 (clamp out-of-range input)
  rotation: number;   // degrees, passed to pdf-lib degrees()
  position: WatermarkPosition;
}

export interface ImageWatermark {
  kind: 'image';
  imageBytes: Uint8Array;
  imageMime: 'image/png' | 'image/jpeg';
  scale: number;      // multiplier on the embedded image's natural size
  opacity: number;    // 0..1 (clamp)
  rotation: number;   // degrees
  position: WatermarkPosition;
}

export type WatermarkConfig = TextWatermark | ImageWatermark;
```

**Module** — `src/lib/pdf/watermark.ts`, exactly two exports:

1. **Pure geometry helper — NO pdf-lib import.** This is the
   heavily-tested core (zero PDF fixtures needed):

   ```ts
   export function watermarkPlacements(
     pageW: number, pageH: number,
     objW: number, objH: number,
     position: WatermarkPosition,
     margin?: number      // default a sensible pt margin, e.g. 24
   ): { x: number; y: number }[];
   ```

   Returns bottom-left-origin PDF-point coords for the object's
   lower-left corner. The 9-point anchors return exactly one placement
   (corners respect `margin`; `center` is centered; edges center on
   their axis). `'tile'` returns a grid covering the page with a fixed
   gap (e.g. 1.5× the object's larger dimension) — document the gap in
   a comment.

2. **The byte transform — loads, stamps, saves:**

   ```ts
   export async function applyWatermark(
     pdfBytes: Uint8Array,
     config: WatermarkConfig,
     targetIndices?: number[]   // default: every page
   ): Promise<Uint8Array>;
   ```

   - **Text branch:** embed Helvetica once (mirror `operator.ts`),
     `objW = font.widthOfTextAtSize(text, fontSize)`, `objH ≈ fontSize`,
     call `watermarkPlacements`, then `drawText` with
     `{ opacity, rotate: degrees(rotation), color: rgb(...) }`. Reuse
     the hex→rgb helper shape from `operator.ts`.
   - **Image branch:** `embedPng` / `embedJpg` per `imageMime` (mirror
     the embed split in `image-import.ts`); object dims = the embedded
     image's `.scale(scale)`; `drawImage` with `{ opacity, rotate }`.
   - **Empty text** (`kind:'text'`, `text === ''`) → return input
     bytes unchanged.
   - **Preserve page count exactly.** Only pages in `targetIndices`
     get stamped (default = all).

The engine is standalone and exercised by its own tests — it is NOT
dead code, it is the layer the future UI will call. Do not add a caller
in the app this run (that's the fenced-off UI work).

<!-- canonical: ~/dev/ai/prompts/push-broken-mode.md -->
## PUSH_BROKEN MODE

The wrapper owns all `git push origin dev` operations — you never push
from inside the cycle. The wrapper probes push at cycle start and end;
queued local commits land automatically when auth is healthy.

If `ops/autonomous/.push-broken` exists in the working tree at the start
of this cycle, the wrapper has determined push is currently failing
(bad auth, expired token, network flap, OOM-killed ssh-agent). You are
in **PUSH_BROKEN mode**. Override:

- **Steps 5 + 6 (session report):** SKIP entirely. Do not write a
  session report and do not commit one. The previous design generated
  80+ "skipped because push broken" report-only commits per night —
  that's the noise this mode exists to eliminate.
- **Decide step:** do NOT skip real code work just because push is
  broken. Commit locally as usual. If you skip for genuine reasons
  (nothing clears the bar), skip silently — no report, no morning-log
  line.

PUSH_BROKEN does not change what you choose to work on. Real work
continues; only the session-report bookkeeping is suppressed.

## PROCESS

### 1. Orient (target: 3–4 min)

Read, in order:
- `STATE.md` — working state, recent fixes, do-not list (mobile-via-
  tailscale, secure-context caveats).
- `git log --oneline -15` — recent work; never duplicate it. Check
  which engine pieces (types, text branch, image branch, tests) have
  already landed this run and continue from there.
- `ops/autonomous/morning-log.md` — what tonight's earlier sessions did.
- `ops/autonomous/sessions/` — latest per-session report(s) for context.
- `CLAUDE.md` — project rules. Especially the secure-context caveat
  (no new `crypto.randomUUID()` without try/catch fallback) and the
  file-layout map.
- `~/dev/CLAUDE.md` — workspace testing standard, especially **what to
  test, what to skip** (real-logic boundaries, not coverage chasing).
- Skim the patterns you'll mirror:
  - `src/lib/pdf/operator.ts` — Helvetica embed + `drawText` + the
    hex→rgb helper + the Y-flip baseline math (annotation loop).
  - `src/lib/pdf/image-import.ts` — `embedPng`/`embedJpg` split, the
    pure bytes-in→bytes-out module shape, inline-fixture discipline.
  - `src/lib/pdf/types.ts` — where the watermark types append; the
    existing discriminated-union style.
  - Existing `*.test.ts` siblings (`image-import.test.ts`,
    `operator.test.ts`) — inline 1×1 PNG/JPG fixtures, vitest shape.

### 2. Decide — cycle decomposition

Build the engine incrementally; ONE coherent piece per cycle that
honestly fits a single ~25–30 minute cycle and clears a meaningful
bar. Rough order (skip a step if git log shows it already landed):

1. **Types + text engine.** Append the watermark types to `types.ts`.
   Create `watermark.ts` with `watermarkPlacements` (all positions +
   tile) and `applyWatermark`'s text branch.
2. **Image engine.** Add `applyWatermark`'s image branch
   (`embedPng`/`embedJpg`), reusing the magic-byte/embed discipline
   from `image-import.ts`.
3. **Placement tests.** `watermark.test.ts`: `watermarkPlacements`
   coords for each of the 9 anchors on a known page size (e.g.
   600×800, object 100×20), `'tile'` returns >1 placements covering
   the page, `margin` respected on corners, `center` is centered.
4. **Transform tests.** `applyWatermark`: page-count invariance,
   empty-text no-op, `targetIndices` subset stamps only those pages,
   opacity clamp, text-vs-image branch dispatch (tiny inline 1×1
   PNG/JPG fixtures like `image-import.test.ts` already uses).
5. **Doc fix (one cycle, optional).** In README "Roadmap", the
   "Text overlays and annotations" item is shipped — check its box or
   move it to Features. One-line edit only; nothing else in README.

Run `npm run check` + `npm run build` (and `npm test` once test files
exist) every cycle; all must pass before commit. Two consecutive
cycles on the same file → switch piece or skip.

### STRICTLY AVOID (hard bans for autonomous cycles)

- **Watermark UI — the entire interactive surface.** Do NOT create a
  `WatermarkDialog` / config UI, do NOT add live preview to
  `PagePreviewModal`, do NOT wire a toolbar button, do NOT add a
  `set-watermark` `Action` to the undo/redo store, do NOT touch the
  export flow (`mergePdf` / `+page.svelte` export path) to call
  `applyWatermark`. The engine ships standalone + tested tonight; all
  wiring is a human follow-up. Building UI unattended is exactly what
  this rig is fenced off from.
- **3.1 Form filling** — design-loaded; needs UI shape decisions.
- **Worker offload** — moving rendering or export to Web Workers is
  architectural debt; not in scope. Don't refactor toward it
  incidentally.
- **Schema-breaking edits to `types.ts`** — appending the watermark
  types is fine; changing `Document` / `PageInfo` / `Action` is not.
- **Coverage-chasing tests** — UI component snapshots, tests that only
  restate the implementation, count-padding. Real-logic only. The
  placement geometry and the byte round-trip ARE real logic;
  component render tests are not.
- **Test fixture sprawl** — construct PNG/JPG fixtures inline (the 1×1
  baseline pattern in `image-import.test.ts`). No committed binary
  `.pdf`/`.png`/`.jpg` unless inline bytes genuinely cannot exercise a
  path; state the reason in the report if you must.
- **README rewrites** beyond the one-line Roadmap fix in cycle 5.
- **License changes** — open decision; needs a human call.
- **Bumping `package.json` `version` / running `/bump`.** This project's
  displayed version is git-derived (`appVersion()` in `vite.config.ts`, off
  `main` history); `package.json` is intentionally frozen at `0.0.1`. Never
  edit the `version` field, never `/bump`, never repoint `appVersion()` at
  package.json. Use conventional-commit subjects (`feat:` for a feature, else
  a plain `fix:`/`chore:`) so the derive classifies the commit. Full rationale
  in CLAUDE.md "Versioning".
- New runtime dependencies of any kind. (`pdf-lib` and `vitest` are
  already present; nothing new is needed.)
- Touching `crypto.randomUUID()` without the existing try/catch
  fallback — secure-context caveat, see CLAUDE.md.
- Broad refactors, file moves, rename churn.
- Editing CLAUDE.md or STATE.md (gitignored — skip).
- Any tool call that would push to `main`, publish a package, or
  `rm -rf` outside the project dir. Hook-gated.

If nothing clears the bar this cycle, SKIP. Still write a report
(step 5). No busywork commits. Convergence-bail will exit the loop
once the engine + tests are done.

### 3. Execute (target: 12–20 min)

- Write the code. Match existing patterns: Svelte 5 runes, no legacy
  stores, `.svelte.ts` for state files, Tailwind 4 via Vite plugin.
  For tests: co-located `*.test.ts`, vitest's `describe`/`it`/`expect`.
- Run the relevant checks:
  - Type-check: `npm run check` (svelte-check via SvelteKit).
  - Build: `npm run build` (must succeed before commit).
  - Tests: `npm test` if the `test` script exists (it does — vitest
    is wired).
- If you break something you cannot quickly fix, revert the working
  tree (`git restore .`) and skip the cycle. Document the attempt
  in the report.

### 4. Commit (only if you have a change)

- `git status` to confirm you're staging only the files you intended.
  Never `git add -A` or `git add .` in a loop like this.
- One-line commit message. Imperative mood. No `Co-Authored-By`, no
  AI attribution, no emojis.
- **Do not push.** The wrapper owns all `git push` calls. See
  PUSH_BROKEN MODE above.
- The guardrails hook blocks `main`-touching ops, package publish,
  and `rm -rf` outside the project. Headless mode converts every
  `ask` into a hard `deny`. Don't try to route around it.

### 5. Session report (ALWAYS — pushed, skipped, or blocked; PUSH_BROKEN excepted)

Write to `ops/autonomous/sessions/YYYY-MM-DD-HHMM.md` (America/
New_York time — cycle start time):

```markdown
# kemek-pdf-lab — YYYY-MM-DD HH:MM

- Outcome: pushed | skipped | blocked
- Duration: Nmin
- Commit: <short-sha or n/a>

## Considered
- Candidate 1 — one-liner on why it was on the table
- Candidate 2 — …

## Picked (and why)
One paragraph. What you chose and the reasoning. If skipped/blocked,
say so here — explain the judgment call honestly.

## Changes
- path/to/file.ts — one line describing the change
(omit if skipped/blocked)

## Checks
- `npm run check`: pass/fail (counts)
- `npm run build`: pass/fail
- `npm test`: pass/fail (counts)

## Diff summary
2–4 sentences in plain prose: what the change does, and why it is
safe in isolation. Call out any subtlety a reviewer should look at
first. Keep it terse.
(omit if skipped/blocked)

## Followups
- One or two things you noticed but did not address. Only items a
  human should actually look at — not a wishlist.
```

Then append ONE line to `ops/autonomous/morning-log.md` (newest at
the bottom):

- Pushed: `YYYY-MM-DD HH:MM pushed <short-sha> — "<summary>" → sessions/YYYY-MM-DD-HHMM.md`
- Skipped: `YYYY-MM-DD HH:MM skipped — "<brief reason>" → sessions/YYYY-MM-DD-HHMM.md`
- Blocked: `YYYY-MM-DD HH:MM blocked — "<what got in the way>" → sessions/YYYY-MM-DD-HHMM.md`

### 6. Commit the report (skip in PUSH_BROKEN; otherwise always)

- Stage `ops/autonomous/sessions/YYYY-MM-DD-HHMM.md` and
  `ops/autonomous/morning-log.md`.
- One-line commit, e.g. `ops: 2026-05-28 01:15 session report (pushed)`.
- **Do not push** — the wrapper handles it.

This is a second commit on top of the code commit (if any). Keeping
them separate means the code commit is reviewable on its own.

## HARD CONSTRAINTS (restating for emphasis)

- Stay inside `/home/kv/dev/projects/kemek-pdf-lab`. Never read or
  write outside it.
- Never push to `main`. Never `promote`, `sync`, or `ff-merge` dev →
  main. Never publish. Never add remotes.
- One focused change per cycle, or a clean skip.
- Exit cleanly whether you pushed, skipped, or blocked.
- Always produce the session report on non-PUSH_BROKEN cycles —
  even on skip/block. The log is the whole point.
- The engine layer ONLY — no watermark UI, preview, store wiring, or
  export integration. That's the fenced-off human follow-up.
- Two consecutive cycles testing or editing the same module should
  prompt the next cycle to switch pieces or skip. Avoid local-maximum
  churn.
