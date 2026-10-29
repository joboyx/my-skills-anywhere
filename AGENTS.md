# AGENTS.md

`my-skills-anywhere` is a Claude Code mod. When the person types `/` in the middle of a message, it adds their own skills and commands to the prompt typeahead. When the `/` token is the whole input it does nothing, because the native slash menu works there. A `/` token at the start of a prompt that already holds other text gets the menu too.
The plugin lives at the repo root. User docs are in `README.md`.

## Layout

| Path                              | Content                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `.claude-plugin/plugin.json`      | Plugin manifest: name, `version`, listing fields                    |
| `.claude-plugin/marketplace.json` | Marketplace `my-skills-anywhere` with one plugin, `source: "./"`    |
| `.claude-plugin/icon.png`         | Listing icon, rendered from `docs/images/icon.svg`                  |
| `.claude-plugin/types/`           | Mod API types that Claude Code generates; git-ignored (see below)   |
| `hooks/hooks.json`                | Hook module list                                                    |
| `hooks/register.ts`               | `rankSkills` (pure ranking) and the `prompt.autocomplete` hook      |
| `tests/register.test.ts`          | Unit tests                                                          |
| `docs/images/`                    | Icon source and the README screenshot                               |
| `.agents/skills/`                 | Repo skills `verify` and `release` (`.claude/skills` links here)    |

Claude Code writes `.claude-plugin/types/` beside the mod when it loads the mod from this folder, and writes it again after a Claude Code update. The folder's own `.gitignore` keeps it out of git. The first line of `claude-code/index.d.ts` names the Claude Code version that wrote it. A fresh clone gets the folder on the first load, such as `claude --plugin-dir .`. Do not edit it.

## Commands

Run from the repo root.

| Task                         | Command                                                  |
| ---------------------------- | -------------------------------------------------------- |
| Unit tests                   | `claude plugin test .`                                   |
| Manifest and layout check    | `claude plugin validate . --strict`                      |
| Plugin directory check       | `claude plugin validate . --profile directory`           |
| Type check                   | `npx -y -p typescript tsc -p .` (needs `.claude-plugin/types/`) |
| Load this copy for a session | `claude --plugin-dir .`                                  |
| Tag a release                | `claude plugin tag .` (tag `my-skills-anywhere--vX.Y.Z`) |

After a code change in a running session, run `/reload-plugins`, or restart `claude`.

## Behaviour

- The hook matches a token that starts with `/`. When only whitespace comes before and after the token (the token is the whole input), it returns `next(e)` unchanged, because the native menu handles it. A `/` token at the start of a prompt that already holds other text gets the rows too.
- It lists commands from `$.command.list()` with `source === 'user'`: skills and commands from `~/.claude/skills`, `~/.claude/commands` and the project's `.claude/skills`.
- Rank: fuzzy match on the name: the query letters appear in order (case-insensitive), and other letters can come between them. A name that starts with the query ranks highest. Letters at a name-part start (after `-`, `_`, `:`, `/`, `.` or a space) and runs of letters rank higher, so `/hellowo` finds `my-hello-world`. Ties sort by shorter name, then by name. Descriptions match as plain text and rank after every name match. At most `MAX_ROWS` (8) rows.
- Each row is `{ text: '/<name> ', label: '/<name>', description }`. The rows go after the rows of other plugins.
- Plugin skills are left out: `source: 'plugin'` holds both plugin skills and plugin commands, and a plugin command does nothing in the middle of a message.

## Rules

- Use made-up generic names only in examples, tests and docs: `release-notes`, `meeting-notes`, `design-discuss`, `code-review`. Never paste real skill lists or real project names.
- Keep the plugin free of one person's or one team's conventions.
- Ranking logic stays a pure function (`rankSkills`) with unit tests. The hook holds only the wiring to Claude Code.
- Every exported function, type and constant has a JSDoc block.

## Skills

- `verify` (`.agents/skills/verify/SKILL.md`): drive a real session with this copy loaded and capture proof per scenario. Run it after a behaviour change.
- `release` (`.agents/skills/release/SKILL.md`): bump the version, test, verify, commit, tag, push on the owner's yes.
