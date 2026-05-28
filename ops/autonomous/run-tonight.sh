#!/usr/bin/env bash
# One-night autonomous rig for kemek-pdf-lab. Loops Opus 4.7 headless
# sessions against ops/autonomous/prompt.md until the wall-clock
# deadline (default: 04:55 America/New_York today). Each session is a
# self-contained "push one improvement" cycle. Commits land on dev;
# main is never touched (guardrails hook enforces this even for
# interactive users — in headless mode ask becomes deny).
#
# Usage:
#   ops/autonomous/run-tonight.sh               # deadline = today 04:55 EDT
#   DEADLINE="2026-04-20 04:55 America/New_York" ops/autonomous/run-tonight.sh
#
# Designed to be invoked via `systemd-run --user` or `nohup` so it
# survives the launching terminal exiting.

set -uo pipefail

PROJECT=/home/kv/dev/projects/kemek-pdf-lab
PROMPT="$PROJECT/ops/autonomous/prompt.md"
LOG_DIR="$HOME/logs"
LOG="$LOG_DIR/kemek-pdf-lab-tonight.log"
CLAUDE=/home/kv/.local/bin/claude

# Per-session soft budget (minutes). A session may exit earlier when it
# pushes/skips/blocks; the wrapper enforces this as a hard kill if the
# session stalls.
SESSION_MINUTES="${SESSION_MINUTES:-25}"
# Minimum remaining window (minutes) before the wrapper is willing to
# start another session. Below this, it exits cleanly.
MIN_REMAINING_MINUTES="${MIN_REMAINING_MINUTES:-8}"
# Inter-session pause (seconds) to let git settle and give the kernel
# room. Keep small.
PAUSE_SECONDS="${PAUSE_SECONDS:-15}"

mkdir -p "$LOG_DIR"

# Signal to guardrails that we have no human at the keyboard.
export CLAUDE_HEADLESS=1
export CLAUDE_PROJECT_DIR="$PROJECT"

# Canonical model + effort for all rigs (override via RIG_MODEL/RIG_EFFORT).
. /home/kv/dev/ops/tools/rig-model.sh

# Pull node onto PATH (systemd user env does not inherit rc files).
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use default >/dev/null 2>&1 || true
fi

ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }

# Resolve deadline to epoch seconds. DEADLINE is interpreted as a
# date-spec in America/New_York unless it already contains a timezone.
# Default: today 04:55 America/New_York. If that is already in the
# past (e.g. launched after 05:00), the wrapper exits immediately
# with a clear log line.
DEADLINE_TZ="${DEADLINE_TZ:-America/New_York}"
DEADLINE_SPEC="${DEADLINE:-$(TZ="$DEADLINE_TZ" date +'%Y-%m-%d') 04:55}"
DEADLINE_EPOCH="$(TZ="$DEADLINE_TZ" date -d "$DEADLINE_SPEC" +%s 2>/dev/null || echo 0)"

{
  echo "===== $(ts) START kemek-pdf-lab-tonight ====="
  echo "project: $PROJECT"
  echo "prompt: $PROMPT"
  echo "model: $RIG_MODEL  effort: $RIG_EFFORT"
  echo "deadline_spec: $DEADLINE_SPEC ($DEADLINE_TZ)"
  echo "deadline_epoch: $DEADLINE_EPOCH ($(date -d "@$DEADLINE_EPOCH" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo '?'))"
  echo "session_minutes: $SESSION_MINUTES  min_remaining: $MIN_REMAINING_MINUTES"
  echo "node: $(command -v node || echo MISSING)  npm: $(command -v npm || echo MISSING)"
  echo "claude: $(command -v "$CLAUDE" || echo MISSING)"
  echo "branch: $(git -C "$PROJECT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  echo "head:   $(git -C "$PROJECT" rev-parse --short HEAD 2>/dev/null || echo '?')"
} >>"$LOG"

if [[ "$DEADLINE_EPOCH" -eq 0 ]]; then
  echo "$(ts) FATAL: could not parse DEADLINE='$DEADLINE_SPEC'" >>"$LOG"
  exit 1
fi

cd "$PROJECT" || { echo "$(ts) FATAL: cannot cd to $PROJECT" >>"$LOG"; exit 1; }

# Wrapper owns all `git push origin dev` calls — agent never pushes.
# See ~/dev/ops/tools/push-probe.sh for protocol details.
PUSH_SENTINEL="$PROJECT/ops/autonomous/.push-broken"
. /home/kv/dev/ops/tools/push-probe.sh
. /home/kv/dev/ops/tools/convergence-check.sh

session_idx=0
while :; do
  now_epoch="$(date +%s)"
  remaining=$(( DEADLINE_EPOCH - now_epoch ))
  remaining_min=$(( remaining / 60 ))

  if (( remaining <= 0 )); then
    echo "$(ts) DEADLINE REACHED — exiting loop after $session_idx session(s)" >>"$LOG"
    break
  fi
  if (( remaining_min < MIN_REMAINING_MINUTES )); then
    echo "$(ts) only ${remaining_min}min left (< $MIN_REMAINING_MINUTES) — exiting cleanly" >>"$LOG"
    break
  fi

  # Clamp per-session budget so we never run past the deadline.
  budget_min="$SESSION_MINUTES"
  if (( budget_min > remaining_min - 2 )); then
    budget_min=$(( remaining_min - 2 ))
  fi
  if (( budget_min < 5 )); then
    echo "$(ts) computed session budget ${budget_min}min < 5 — exiting cleanly" >>"$LOG"
    break
  fi

  session_idx=$(( session_idx + 1 ))
  update_push_state || true
  {
    echo ""
    echo "----- $(ts) SESSION #$session_idx start (budget=${budget_min}min, remaining=${remaining_min}min) -----"
    echo "head before: $(git -C "$PROJECT" rev-parse --short HEAD 2>/dev/null || echo '?')"
    if [[ -f "$PUSH_SENTINEL" ]]; then
      echo "push state: BROKEN (sentinel: $PUSH_SENTINEL)"
    fi
  } >>"$LOG"

  # `timeout` enforces a hard wall-clock cap per session so a stuck
  # agent can't drain the whole night.
  timeout --signal=TERM --kill-after=30s "${budget_min}m" \
    "$CLAUDE" \
      --print \
      --model "$RIG_MODEL" \
      --effort "$RIG_EFFORT" \
      --permission-mode acceptEdits \
      --output-format text \
      "$(cat "$PROMPT")" \
      >>"$LOG" 2>&1
  rc=$?

  {
    echo "----- $(ts) SESSION #$session_idx end rc=$rc -----"
    echo "head after:  $(git -C "$PROJECT" rev-parse --short HEAD 2>/dev/null || echo '?')"
  } >>"$LOG"

  # Push any commits the agent just made (don't wait for next cycle).
  update_push_state || true

  # Bail early if the rig has converged — last N cycles all wrote
  # skip-only session reports with no source change. Avoids the
  # 164-skip nights observed on calendar/digest 2026-05-08.
  streak=$(convergence_skip_streak)
  if (( streak >= ${CONVERGENCE_THRESHOLD:-5} )); then
    echo "$(ts) CONVERGENCE — $streak consecutive skip-only commits, exiting after session #$session_idx" >>"$LOG"
    break
  fi

  # If the session timed out and produced nothing, still loop — the
  # next iteration will check the deadline. A very short pause keeps
  # git operations from colliding on disk buffers.
  sleep "$PAUSE_SECONDS"
done

echo "===== $(ts) END kemek-pdf-lab-tonight sessions_run=$session_idx =====" >>"$LOG"
exit 0
