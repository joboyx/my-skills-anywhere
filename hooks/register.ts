import type { CommandInfo, Register } from 'claude-code'

/**
 * The most rows the mod adds to the typeahead for one token.
 */
export const MAX_ROWS = 8

// Fuzzy score constants, the same as fzf's.
const SCORE_MATCH = 16
const GAP_START = -3
const GAP_EXTENSION = -1
const BONUS_BOUNDARY = 8
// fzf's start-of-text bonus, so a whole-name prefix beats a later name-part prefix.
const BONUS_START = BONUS_BOUNDARY + 2
const BONUS_CONSECUTIVE = 4
const FIRST_CHAR_MULTIPLIER = 2
const BOUNDARY_CHARS = '-_:/. '

/**
 * Returns the fzf-style fuzzy score of `query` against `text`: higher is
 * better, `undefined` when the query letters do not all appear in order.
 *
 * Each matched letter scores `SCORE_MATCH`. A letter at index 0 gets
 * `BONUS_START`; a letter after a `-`, `_`, `:`, `/`, `.` or space gets
 * `BONUS_BOUNDARY`. The first query letter gets its bonus doubled. A run of
 * consecutive letters gets at least `BONUS_CONSECUTIVE` per letter and keeps
 * the bonus of its first letter.
 * A gap between matched letters costs `GAP_START`, plus `GAP_EXTENSION` for
 * each further skipped letter. A dynamic program picks the best alignment,
 * not the leftmost one.
 */
function fuzzyScore(text: string, query: string): number | undefined {
  const n = text.length
  const bonus = Array.from({ length: n }, (_, i) =>
    i === 0 ? BONUS_START : BOUNDARY_CHARS.includes(text.charAt(i - 1)) ? BONUS_BOUNDARY : 0,
  )

  // prev[i]: best score with the previous query letter matched at i;
  // prevRun[i]: the bonus of the first letter of the run that ends at i.
  let prev: number[] = []
  let prevRun: number[] = []
  for (let j = 0; j < query.length; j++) {
    const cur = new Array<number>(n).fill(-Infinity)
    const curRun = new Array<number>(n).fill(0)
    let bestGapBase = -Infinity // max of prev[k] - k * GAP_EXTENSION over k <= i - 2
    for (let i = 0; i < n; i++) {
      if (j > 0 && i >= 2) bestGapBase = Math.max(bestGapBase, (prev[i - 2] ?? -Infinity) - (i - 2) * GAP_EXTENSION)
      if (text.charAt(i) !== query.charAt(j)) continue

      const b = bonus[i] ?? 0
      if (j === 0) {
        cur[i] = SCORE_MATCH + b * FIRST_CHAR_MULTIPLIER
        curRun[i] = b
        continue
      }

      // Skipping the i - k - 1 letters between k and i costs
      // GAP_START + (i - k - 2) * GAP_EXTENSION.
      const gap = bestGapBase + GAP_START + (i - 2) * GAP_EXTENSION + SCORE_MATCH + b
      const before = prev[i - 1] ?? -Infinity
      const beforeRun = prevRun[i - 1] ?? 0
      let consecutive = -Infinity
      let run = 0
      if (before > -Infinity) {
        run = b >= BONUS_BOUNDARY && b > beforeRun ? b : beforeRun
        consecutive = before + SCORE_MATCH + Math.max(b, run, BONUS_CONSECUTIVE)
      }
      if (consecutive >= gap) {
        cur[i] = consecutive
        curRun[i] = run
      } else {
        cur[i] = gap
        curRun[i] = b
      }
    }
    prev = cur
    prevRun = curRun
  }

  const best = Math.max(...prev)
  return best > -Infinity ? best : undefined
}

/**
 * Picks the person's own commands (source `user`: user and project skills)
 * that match the query, best first, at most `MAX_ROWS`.
 *
 * Names match fuzzily (query letters in order, case-insensitive): higher
 * score first, then shorter name, then name. Commands whose description holds
 * the query as plain text come after every name match, by shorter name, then
 * name. An empty query lists them by name.
 */
export function rankSkills(commands: readonly CommandInfo[], query: string): CommandInfo[] {
  const q = query.toLowerCase()
  const own = commands.filter(c => c.source === 'user')
  if (q === '') {
    return own.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ROWS)
  }
  const byName = (a: CommandInfo, b: CommandInfo) => a.name.length - b.name.length || a.name.localeCompare(b.name)

  const nameMatches: { command: CommandInfo; score: number }[] = []
  const descriptionMatches: CommandInfo[] = []
  for (const command of own) {
    const score = fuzzyScore(command.name.toLowerCase(), q)
    if (score !== undefined) nameMatches.push({ command, score })
    else if (command.description.toLowerCase().includes(q)) descriptionMatches.push(command)
  }
  nameMatches.sort((a, b) => b.score - a.score || byName(a.command, b.command))
  descriptionMatches.sort(byName)
  return [...nameMatches.map(m => m.command), ...descriptionMatches].slice(0, MAX_ROWS)
}

/**
 * Adds the person's own skills to the typeahead for a `/token` when other
 * text comes before or after it; when the token is the whole input the native
 * slash menu already shows them, so the hook passes through there.
 */
export const register: Register = on => {
  on('prompt.autocomplete', { token: /^\// }, async ($, e, next) => {
    const before = e.text.slice(0, e.start)
    const after = e.text.slice(e.start + e.token.length)
    if (before.trim() === '' && after.trim() === '') return next(e)

    const skills = rankSkills(await $.command.list(), e.token.slice(1))
    const rows = skills.map(c => ({
      text: `/${c.name} `,
      label: `/${c.name}`,
      description: c.description,
    }))
    return { suggestions: [...(await next(e)).suggestions, ...rows] }
  })
}
