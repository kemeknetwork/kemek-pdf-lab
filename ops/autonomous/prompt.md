# kemek-pdf-lab — one-night autonomous session

You are an autonomous agent running in a loop on Poseidon tonight until
the wrapper deadline (default 04:55 America/New_York; this rig runs
03:00–03:55). The wrapper fires fresh headless Opus 4.7 sessions
back-to-back with this prompt. Each invocation is one self-contained
cycle: orient, pick ONE improvement, push it to `dev` (or skip
cleanly), write a report. Then exit.

Working directory is always `/home/kv/dev/projects/kemek-pdf-lab`. Branch
is `dev`. You are the only contributor. Never touch `main`. Never
`promote` or `sync` — those advance `main` and are human-review-gated.
Never publish anything. The guardrails hook enforces all of this — trust
it.

## OBJECTIVE

The Phase 1 + Phase 2 MVP shipped (merge, arrange, rotate, delete, undo,
multi-doc, export, split, page labels, preferences, PWA). This rig
exists to close out the **two small Phase 3 items** with no design
overhead: keyboard shortcuts and image import. Push ONE small,
genuinely valuable improvement per cycle, OR skip cleanly. No busywork.

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
- `git log --oneline -15` — recent work; never duplicate it.
- `ops/autonomous/morning-log.md` — what tonight's earlier sessions did.
- `ops/autonomous/sessions/` — latest per-session report(s) for context.
- `CLAUDE.md` — project rules. Especially the secure-context caveat
  (no new `crypto.randomUUID()` without try/catch fallback) and the
  file-layout map.
- Skim the area of code you're likely to touch:
  - For shortcuts: `src/routes/+page.svelte`, `src/lib/components/
    Toolbar.svelte`, `src/lib/components/PageGrid.svelte`,
    `src/lib/stores/app.svelte.ts`.
  - For image import: `src/lib/components/DropZone.svelte`,
    `src/lib/utils/validate.ts`, `src/lib/pdf/operator.ts`,
    `src/lib/pdf/types.ts`, `src/lib/stores/app.svelte.ts`.

### 2. Decide

Pick ONE change that honestly fits a single ~15–20 minute cycle and
clears a meaningful quality bar. Tonight's scope is bounded to two
Phase 3 items — both can be split into multiple cycles.

#### 3.2 — Keyboard shortcuts (preferred candidate shape)

Goal: full keyboard navigation of the page grid + an in-app help
overlay. Existing partial coverage: R for rotate, Delete/Backspace
already wired (verify in `Toolbar.svelte` / `+page.svelte`). Gaps:

- **Grid navigation:** arrow keys move focus between page thumbnails.
  Tab should reach the grid as a single composite focus target, then
  arrow keys take over (roving tabindex pattern). Enter/Space toggles
  selection on focused page.
- **Bulk selection:** Ctrl+A select all, Ctrl+D deselect all,
  Shift+arrow extend range from `lastSelectedId`.
- **Existing op shortcuts:** confirm R (rotate cw), Shift+R (rotate
  ccw), Delete/Backspace (delete), Ctrl+Z / Ctrl+Shift+Z (undo/redo)
  all work and are documented.
- **Help overlay:** `?` key (Shift+/) opens a modal listing every
  shortcut grouped by category. Esc closes. Focus trapped while open.
  Single component, no new dependency.
- **Don't shadow text inputs:** shortcut handlers must check
  `event.target` and bail if focus is in an `<input>`, `<textarea>`,
  or `[contenteditable]` (the FilenameDialog and label inputs need to
  type letters freely).

Each of these can be its own cycle. Prefer the smallest standalone
chunk that compiles + passes existing checks.

#### 3.3 — Image import (alternative candidate shape)

Goal: accept JPG/PNG file drops alongside PDFs. Each image becomes a
single-page "document" embedded via pdf-lib at the image's intrinsic
dimensions. Implementation hooks:

- **Validate:** extend `src/lib/utils/validate.ts` to also accept
  `image/jpeg`, `image/png` (magic-byte sniff: JPG `FF D8 FF`,
  PNG `89 50 4E 47`). Rename current PDF-only path or branch by
  detected type — keep the function single-entry-point.
- **Convert:** new `src/lib/pdf/image-import.ts` (or extend
  `operator.ts`) that takes a `Uint8Array` + mime, uses
  `PDFDocument.create()` + `embedJpg`/`embedPng` + `addPage` sized
  to the image's dimensions (capped sensibly so a 12000×9000 photo
  doesn't produce a giant page — page in points, image in pixels at
  72 DPI baseline). Returns a `Uint8Array` of the synthesized PDF.
- **Wire in:** `DropZone.svelte` route image bytes through the
  converter, then funnel into the existing `addDocument` path with
  the synthesized PDF. The image's filename becomes the document
  name (with extension preserved or swapped to `.pdf` — pick one
  and stay consistent).
- **Renderer:** PDF.js renders the synthesized PDF normally — no
  separate code path. Verify thumbnails appear correctly.
- **Tests:** if the project has Vitest already, add one round-trip
  test (image bytes in → PDF bytes out → page count == 1, page
  dimensions reasonable). Otherwise skip — don't introduce a test
  framework just for this.

Image import can usually be done in one tight cycle.

### STRICTLY AVOID (hard bans for autonomous cycles)

- **2.2 Text overlay** — kVadrum is working on this interactively.
  Touching `app.svelte.ts`, `types.ts`, or any preview/annotation
  surface in a way that conflicts with that work would create merge
  pain. If your shortcut work needs to share state with annotations,
  skip — let the interactive branch land first.
- **3.1 Form filling** — design-loaded; needs UI shape decisions.
- **3.4 Watermark** — same; needs a preview surface this app does
  not have yet.
- **Worker offload** — moving rendering or export to Web Workers is
  architectural debt called out in CLAUDE.md "Known gaps", not in
  scope tonight. Don't refactor toward it incidentally.
- **README rewrites** beyond a one-line update reflecting the
  shortcut/image-import additions.
- **License changes** — open decision in NEXT-STEPS; needs human
  call.
- New runtime dependencies of any kind. (Both 3.2 and 3.3 use
  what's already installed.)
- Touching `crypto.randomUUID()` without the existing try/catch
  fallback — secure-context caveat, see CLAUDE.md.
- Schema-breaking changes to `Document` / `PageInfo` / `Action`
  types in `types.ts` — append-only is fine, breaking is not.
- Broad refactors, file moves, rename churn.
- Editing CLAUDE.md or STATE.md (gitignored — skip).
- Any tool call that would push to `main`, publish a package, or
  `rm -rf` outside the project dir. Hook-gated.

If nothing clears the bar this cycle, SKIP. Still write a report
(step 5). No busywork commits. Convergence-bail will exit the loop
once Phase 3.2/3.3 are done.

### 3. Execute (target: 10–12 min)

- Write the code. Match existing patterns: Svelte 5 runes, no legacy
  stores, `.svelte.ts` for state files, Tailwind 4 via Vite plugin.
- Run the relevant checks:
  - Type-check: `npm run check` (svelte-check via SvelteKit).
  - Build: `npm run build` (must succeed before commit).
  - Tests: `npm test` if Vitest is wired (verify in `package.json`).
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
- `npm test`: pass/fail (if wired and touched)

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
- One-line commit, e.g. `ops: 2026-05-09 03:15 session report (pushed)`.
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
- Two consecutive cycles in the same shortcut/import sub-area should
  prompt the next cycle to switch sub-areas or skip. Avoid local-
  maximum churn.
