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

Phase 1 + Phase 2 MVP and Phase 3.2 (keyboard shortcuts) + Phase 3.3
(image import) all shipped. The interactive surfaces are caught up.
This rig's job now is to **pin down the binary/security boundaries with
real tests** and clean up the last small interactive residual. Push ONE
small, genuinely valuable improvement per cycle, OR skip cleanly. No
busywork.

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
- `~/dev/CLAUDE.md` — workspace testing standard, especially **what to
  test, what to skip** (real-logic boundaries, not coverage chasing).
- Skim the area of code you're likely to touch:
  - For tests: `src/lib/pdf/image-import.ts`, `src/lib/pdf/operator.ts`,
    `src/lib/utils/validate.ts`, `src/lib/pdf/types.ts`. Any existing
    sibling `*.test.ts` files.
  - For Ctrl+A residual: `src/routes/+page.svelte`, `src/lib/components/
    PageGrid.svelte`, `src/lib/stores/app.svelte.ts`,
    `src/lib/components/KeyboardHelp.svelte`.

### 2. Decide

Pick ONE change that honestly fits a single ~15–20 minute cycle and
clears a meaningful quality bar. Two candidate surfaces tonight, both
splittable across multiple cycles.

#### A — Test coverage for pure-logic modules (preferred candidate shape)

The project ships pdf-lib binary round-trips and a magic-byte security
validator with **zero tests**. Vitest is in devDeps but not yet wired
(`package.json` has no `test` script and no `*.test.ts` files exist).
The workspace standard explicitly invites rig tests on real-logic
surfaces: parsers, binary round-trips, security validators.

**First cycle to pick this candidate** must do the wiring:
- Add `"test": "vitest run"` to `package.json` scripts.
- Optional: `"test:watch": "vitest"` if useful.
- One `*.test.ts` file co-located next to the source it pins (per
  workspace standard: co-locate by default).
- Run `npm test` as part of Checks — it must pass.

**Subsequent cycles** add one focused test file per cycle. Candidate
targets, in rough priority:

- **`src/lib/utils/validate.ts`** — magic-byte sniff for PDF / JPG / PNG
  is a security boundary (drives whether bytes flow into pdf-lib or
  get rejected). Tests should cover: PDF magic `25 50 44 46`, JPG
  `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, size-limit rejection,
  off-by-one truncated headers, mismatched extension vs content.
- **`src/lib/pdf/image-import.ts`** — binary round-trip: bytes in →
  synthesized PDF bytes out. Verify page count == 1, page dimensions
  reasonable for a known fixture (e.g. 100×100 PNG → 100pt × 100pt at
  72 DPI baseline), and that `embedJpg` vs `embedPng` paths are
  selected correctly by mime/magic.
- **`src/lib/pdf/operator.ts`** — `merge` (multi-doc input → single doc
  output, page count = sum), `rotate` (90/180/270 round-trip
  preserves page count, rotation metadata is correct on re-parse).
  Skip `export` if it's a thin shim; test it only if there's real
  logic beyond pdf-lib pass-through.

**What NOT to test** (mirrors workspace standard):
- Svelte components — no snapshot/render tests, no coverage chasing
  on UI files.
- Trivial wrappers where the test would only restate the
  implementation.
- File-access utilities that thunk to browser APIs — test fixtures
  would be more fiction than verification.

Use small synthetic fixtures (bytes constructed inline or a tiny
`*.test.fixtures.ts`) — do NOT commit binary PDF/PNG files unless
they're genuinely the only way to exercise a code path.

#### B — Ctrl+A select-all (residual 3.2 sub-item)

The only keyboard-shortcut sub-item still open: Ctrl+A selects all
pages in the grid. Existing infrastructure:
- `app.svelte.ts` already has a selection store; arrow-nav landed
  2026-05-11.
- `KeyboardHelp.svelte` lists shortcuts — add the new entry there.
- Same input-shadowing guard pattern used by every other shortcut:
  bail if `event.target` is `<input>`, `<textarea>`, or
  `[contenteditable]`.

This is one tight cycle. Document the shortcut in the help modal in
the same commit.

### STRICTLY AVOID (hard bans for autonomous cycles)

- **3.1 Form filling** — design-loaded; needs UI shape decisions.
- **3.4 Watermark** — needs a preview surface this app does not have
  yet.
- **Worker offload** — moving rendering or export to Web Workers is
  architectural debt called out in CLAUDE.md "Known gaps", not in
  scope tonight. Don't refactor toward it incidentally.
- **Coverage-chasing tests** — UI component snapshots, tests that
  only restate the implementation, tests written to pad the count.
  Real-logic only. (Workspace standard.)
- **Test fixture sprawl** — no committed binary `.pdf` / `.png`
  unless inline-byte construction genuinely cannot exercise the
  code path. State the reason in the report if you do commit one.
- **README rewrites** beyond a one-line update reflecting new tests
  or the Ctrl+A shortcut.
- **License changes** — open decision; needs human call.
- New runtime dependencies of any kind. (Vitest is already in
  devDeps; that's the only "new" tooling allowed.)
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
once the binary-boundary tests + Ctrl+A residual are done.

### 3. Execute (target: 10–12 min)

- Write the code. Match existing patterns: Svelte 5 runes, no legacy
  stores, `.svelte.ts` for state files, Tailwind 4 via Vite plugin.
  For tests: co-located `*.test.ts`, vitest's `describe`/`it`/`expect`.
- Run the relevant checks:
  - Type-check: `npm run check` (svelte-check via SvelteKit).
  - Build: `npm run build` (must succeed before commit).
  - Tests: `npm test` if the `test` script exists (you wired it on the
    first test-coverage cycle, or it's already there).
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
- `npm test`: pass/fail (counts; omit if no `test` script yet)

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
- One-line commit, e.g. `ops: 2026-05-14 03:15 session report (pushed)`.
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
- Two consecutive cycles testing the same module should prompt the
  next cycle to switch modules or skip. Avoid local-maximum churn.
