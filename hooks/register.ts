import type { CommandInfo, Register } from 'claude-code'

/**
 * The most rows the mod adds to the typeahead for one token.
 */
export const MAX_ROWS = 8

/**
 * Returns how well a command name or description matches the query: lower is
 * better, `undefined` is no match.
 *
 * 0 exact name, 1 name prefix, 2 prefix of a name part split on `-`, `_` or
 * `:`, 3 name substring, 4 description substring.
 */
function tierOf(command: CommandInfo, query: string): number | undefined {
  const name = command.name.toLowerCase()
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.split(/[-_:]/).some(part => part.startsWith(query))) return 2
  if (name.includes(query)) return 3
  if (command.description.toLowerCase().includes(query)) return 4
  return undefined
}

/**
 * Picks the person's own commands (source `user`: user and project skills)
 * that match the query, best first, at most `MAX_ROWS`.
 *
 * Order: match tier, then shorter name, then name. An empty query lists them
 * by name.
 */
export function rankSkills(commands: readonly CommandInfo[], query: string): CommandInfo[] {
  const q = query.toLowerCase()
  const own = commands.filter(c => c.source === 'user')
  if (q === '') {
    return own.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ROWS)
  }
  return own
    .map(command => ({ command, tier: tierOf(command, q) }))
    .filter((m): m is { command: CommandInfo; tier: number } => m.tier !== undefined)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.command.name.length - b.command.name.length ||
        a.command.name.localeCompare(b.command.name),
    )
    .slice(0, MAX_ROWS)
    .map(m => m.command)
}

/**
 * Adds the person's own skills to the typeahead for a `/token` typed after
 * other text; at the start of the input the native slash menu already shows
 * them, so the hook passes through there.
 */
export const register: Register = on => {
  on('prompt.autocomplete', { token: /^\// }, async ($, e, next) => {
    if (e.text.slice(0, e.start).trim() === '') return next(e)

    const skills = rankSkills(await $.command.list(), e.token.slice(1))
    const rows = skills.map(c => ({
      text: `/${c.name} `,
      label: `/${c.name}`,
      description: c.description,
    }))
    return { suggestions: [...(await next(e)).suggestions, ...rows] }
  })
}
