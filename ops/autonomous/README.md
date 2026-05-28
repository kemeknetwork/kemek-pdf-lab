# ops/autonomous — autonomous rig

The per-project autonomous build rig: a wrapper that loops headless
Claude Code sessions, a per-cycle prompt, and per-cycle reports. Runs
both as a recurring daily rig and as a one-off, depending on how it's
armed.

**Canonical policy: `~/dev/CLAUDE.md` → "Autonomous rigs & concierge".**
Arm/disarm only via `~/dev/ops/concierge/concierge.py` (`arm` /
`disable` / `reconcile` / `status`) so the concierge config
(`tonight.yaml`) stays the single source of truth. Never hand-roll
`systemd-run` / `systemctl enable` for a rig — concierge can't manage
what it didn't create, and that's what made `reconcile` unsafe before.

## What this is

- `run-tonight.sh` — wrapper that loops headless Opus 4.7 sessions
  back-to-back until the wall-clock deadline (default 04:55
  America/New_York today). Each session runs the prompt below with a
  hard per-session timeout, so a stuck agent cannot eat the night.
- `prompt.md` — the iterative prompt. One cycle = orient, pick ONE
  safe improvement, commit-or-skip, write a report, exit. The wrapper
  owns all `git push` calls (probes at cycle boundaries, manages the
  `.push-broken` sentinel for when auth/network goes down — see
  `~/dev/ops/tools/push-probe.sh`).
- `morning-log.md` — newest-at-bottom index of what happened each
  cycle.
- `sessions/` — per-cycle reports, timestamped.

## Policy (tonight-specific — looser than normal)

- `dev` is open: agent commits freely; wrapper pushes at cycle
  boundaries.
- `main` is closed: the guardrails hook (`.claude/hooks/guardrails.sh`)
  converts any `main`-touching operation to `ask`, and in headless
  mode (`CLAUDE_HEADLESS=1`) `ask` becomes a hard `deny`.
- Package publish (`npm/pnpm/yarn/bun publish`) is always denied in
  headless mode.
- `rm -rf` with an absolute path outside the project is hard-denied.

## Arming the rig

Always through concierge — it records the rig in `tonight.yaml` and
reconciles systemd. Never raw `systemd-run`.

```bash
# Recurring (nightly):
~/dev/ops/concierge/concierge.py arm kemek-pdf-lab --daily "03:00" --deadline "04:55"

# One-off (single run):
~/dev/ops/concierge/concierge.py arm kemek-pdf-lab --once "2026-05-30 03:00" --deadline "2026-05-30 04:55"

# See what's armed vs what the config wants:
~/dev/ops/concierge/concierge.py status
```

Logs stream to `~/logs/kemek-pdf-lab-tonight.log` (one-off) or
`~/logs/kemek-pdf-lab-daily.log` (recurring).

## Pausing / stopping

```bash
# Pause this project's rig(s) (recurring → enabled:false, one-off removed) + reconcile:
~/dev/ops/concierge/concierge.py disable kemek-pdf-lab
```

To kill an in-flight run immediately, stop its unit directly:
`systemctl --user stop kemek-pdf-lab-tonight` (one-off) or
`kemek-pdf-lab-daily` (recurring). A claude session already running takes
up to `--kill-after=30s` to exit.

## Status checks

```bash
systemctl --user status kemek-pdf-lab-tonight
tail -f ~/logs/kemek-pdf-lab-tonight.log
git -C /home/kv/dev/projects/kemek-pdf-lab log --oneline origin/dev..dev
ls /home/kv/dev/projects/kemek-pdf-lab/ops/autonomous/sessions/
```

## Recurring vs one-off

Same wrapper, same prompt — only the arming differs (`--daily` vs
`--once`, above). A one-off fires once and self-cleans; a recurring rig
is a persistent unit that survives reboots. Neither re-arms itself
beyond its schedule. Switch a project between the two with
`concierge.py arm` (re-arming replaces the prior entry) or pause it with
`concierge.py disable`.
