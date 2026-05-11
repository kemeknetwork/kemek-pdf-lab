# ops/autonomous — one-night rig

Adapted drop-in of the `claude-expo/ichnograph` daily rig, tuned for a
single-night iterative run instead of a recurring 15-minute daily
session.

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

## Starting the rig

```bash
# Default: deadline = today 04:55 America/New_York
systemd-run --user --unit=kemek-pdf-lab-tonight \
  --description="kemek-pdf-lab one-night autonomous run" \
  /home/kv/dev/projects/kemek-pdf-lab/ops/autonomous/run-tonight.sh

# Or override the deadline (interpreted in DEADLINE_TZ, default ET):
DEADLINE="2026-04-20 04:55" \
  systemd-run --user --unit=kemek-pdf-lab-tonight \
  /home/kv/dev/projects/kemek-pdf-lab/ops/autonomous/run-tonight.sh

# Override timezone too:
DEADLINE_TZ="UTC" DEADLINE="2026-04-20 08:55" \
  systemd-run --user --unit=kemek-pdf-lab-tonight \
  /home/kv/dev/projects/kemek-pdf-lab/ops/autonomous/run-tonight.sh
```

Logs stream to `~/logs/kemek-pdf-lab-tonight.log`.

## Stopping early

```bash
systemctl --user stop kemek-pdf-lab-tonight
```

This terminates the wrapper; any claude session already running
inside it takes up to `--kill-after=30s` to exit.

## Status checks

```bash
systemctl --user status kemek-pdf-lab-tonight
tail -f ~/logs/kemek-pdf-lab-tonight.log
git -C /home/kv/dev/projects/kemek-pdf-lab log --oneline origin/dev..dev
ls /home/kv/dev/projects/kemek-pdf-lab/ops/autonomous/sessions/
```

## Why this is not a recurring timer

This is a one-night thing. When the wrapper exits at the deadline,
that's it — nothing re-arms itself. If you want a recurring version
later, model it on `claude-expo/ops/run-ichnograph-daily.sh` +
systemd user timer; don't bolt it onto this wrapper.
