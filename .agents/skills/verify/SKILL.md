---
name: verify
description: Drives a real Claude Code session with this repo's copy of my-skills-anywhere loaded, the way a user types, through tmux, and saves a screen capture per scenario with a pass or fail result. Use after a behaviour change, before a release, or when asked to prove the mid-message menu works.
---

# verify

Start `claude --plugin-dir <repo>` in a detached tmux session inside a scratch project that holds two made-up skills. Type into the prompt without pressing Enter, read the screen with `tmux capture-pane -p`, and save each capture as proof.

The ranking rules have unit tests. Run `claude plugin test .` for them. This skill proves the wiring: load, the hook, the rows on screen and Tab.

## Setup

1. Preflight: `tmux -V`.
2. Make the proof folder, the scratch project and `lib.sh`. Shell state does not persist between tool calls, so `lib.sh` holds literal paths. Source it in each later call.

```sh
REPO="$(git rev-parse --show-toplevel)"
OUT="${TMPDIR:-/tmp}/my-skills-anywhere-verify-$(date +%Y%m%d-%H%M%S)"
for s in release-notes:'Draft release notes from the commits since the last tag' \
         meeting-notes:'Turn a meeting transcript into notes with action items'; do
  name="${s%%:*}"; mkdir -p "$OUT/project/.claude/skills/$name"
  printf -- '---\nname: %s\ndescription: %s\n---\n\nVerify fixture.\n' "$name" "${s#*:}" \
    > "$OUT/project/.claude/skills/$name/SKILL.md"
done

cat > "$OUT/lib.sh" <<EOF
REPO='$REPO'
OUT='$OUT'
start() { tmux new-session -d -s "\$1" -x 160 -y 40 -c "\$OUT/project" "claude --plugin-dir '\$REPO'"; }
type_() { tmux send-keys -t "\$1" -l "\$2"; sleep 1; }
snap() { tmux capture-pane -p -t "\$1" > "\$OUT/\$2.txt"; echo "\$OUT/\$2.txt"; }
wait_for() { # wait_for <session> <grep -E pattern> [seconds]
  n="\${3:-30}"
  while [ "\$n" -gt 0 ]; do
    tmux capture-pane -p -t "\$1" | grep -Eq "\$2" && return 0
    sleep 1; n=\$((n - 1))
  done
  return 1
}
ready() { # accept the folder trust prompt if shown, then wait for the input line
  wait_for "\$1" 'trust this folder|^❯' 60 || return 1
  if tmux capture-pane -p -t "\$1" | grep -q 'trust this folder'; then
    tmux send-keys -t "\$1" Down; sleep 0.5; tmux send-keys -t "\$1" Enter; sleep 3
  fi
  wait_for "\$1" '^❯' 60
}
EOF
echo "$OUT"
```

Keep the printed `$OUT` path. Use a unique session name per run, for example `msa-a-<timestamp>`. The folder trust prompt defaults to `No, exit`; `ready` picks `Yes, I trust this folder`.

Your own skills from `~/.claude/skills` also show in the menu. That is expected. Match only the two fixture rows.

## Scenarios

Session A covers scenarios 1 and 2. Session B covers scenario 3, so its input starts empty.

```sh
. "<OUT>/lib.sh"; A=msa-a-<timestamp>; B=msa-b-<timestamp>
start "$A"; ready "$A"
```

| # | Scenario               | Steps                                                                                                  | Pass when                                                                                                     |
| - | ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1 | Mid-message menu       | `type_ "$A" 'fix the flaky test, then /notes'`; `wait_for "$A" '/meeting-notes' 10`; `snap "$A" 01-menu` | Above the prompt box, `/meeting-notes` and `/release-notes` show with their descriptions, `/meeting-notes` first   |
| 2 | Tab replaces the token | `tmux send-keys -t "$A" Tab`; `sleep 1`; `snap "$A" 02-tab`                                            | The prompt line reads `fix the flaky test, then /meeting-notes` with the text before it unchanged             |
| 3 | Start of input         | `start "$B"; ready "$B"`; `type_ "$B" '/meeting-n'`; `wait_for "$B" '/meeting-notes' 10`; `snap "$B" 03-start` | The native menu shows `/meeting-notes`, and only once: `grep -c '/meeting-notes' 03-start.txt` prints `1`      |

On a fail, keep the capture, take one more capture after 5 s, and record both.

## Cleanup

```sh
tmux kill-session -t "$A"; tmux kill-session -t "$B"
tmux ls 2>/dev/null | grep msa- || echo "no verify sessions left"
```

Keep `$OUT` for the report. Delete it only when the owner asks.

## Report

End with this table. Give the proof file as the full path under `$OUT`.

| # | Scenario               | Result    | Proof               |
| - | ---------------------- | --------- | ------------------- |
| 1 | Mid-message menu       | pass/fail | `$OUT/01-menu.txt`  |
| 2 | Tab replaces the token | pass/fail | `$OUT/02-tab.txt`   |
| 3 | Start of input         | pass/fail | `$OUT/03-start.txt` |

Under the table, quote the prompt and menu lines from the capture of each failed scenario.
