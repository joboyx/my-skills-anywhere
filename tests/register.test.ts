import type { CommandInfo, PromptAutocompleteInput, PromptAutocompleteResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { MAX_ROWS, rankSkills } from '../hooks/register'

const user = (name: string, description = ''): CommandInfo => ({ name, description, source: 'user' })

const COMMANDS: CommandInfo[] = [
  user('rediscussion'), // substring-only match for "discuss"
  user('notes', 'discuss a topic first'), // description-only match
  user('design-discuss', 'Talk a design through before coding'),
  { name: 'discuss', description: 'built-in', source: 'builtin' },
  { name: 'discuss-plugin', description: '', source: 'plugin', plugin: 'x' },
  { name: 'discuss-mcp', description: '', source: 'mcp' },
]

/**
 * The prompt box with `draft` typed and the caret at its end, the token being
 * the last run of non-whitespace.
 */
function box(draft: string): PromptAutocompleteInput {
  const start = draft.search(/\S+$/)
  return { text: draft, cursor: draft.length, token: draft.slice(start), start }
}

/**
 * `prompt.autocomplete` is not on the typed test `$`, so the test reaches
 * the engine's call by name.
 */
type Autocomplete = { prompt: { autocomplete: (e: PromptAutocompleteInput) => Promise<PromptAutocompleteResult> } }

test('ranks a name-part prefix before substring and description matches', () => {
  expect(rankSkills(COMMANDS, 'discuss').map(c => c.name)).toEqual(['design-discuss', 'rediscussion', 'notes'])
})

test('exact and prefix matches lead', () => {
  const list = [user('design-discuss'), user('discussion'), user('disc')]
  expect(rankSkills(list, 'Disc').map(c => c.name)).toEqual(['disc', 'discussion', 'design-discuss'])
})

test('lists only your own commands', () => {
  const names = rankSkills(COMMANDS, 'discuss').map(c => c.name)
  expect(names).not.toContain('discuss')
  expect(names).not.toContain('discuss-plugin')
  expect(names).not.toContain('discuss-mcp')
})

test('caps the rows, and an empty query lists by name', () => {
  const many = Array.from({ length: 12 }, (_, i) => user(`my-skill-${String(i).padStart(2, '0')}`))
  expect(rankSkills(many, 'skill')).toHaveLength(MAX_ROWS)
  expect(rankSkills([user('b'), user('a')], '').map(c => c.name)).toEqual(['a', 'b'])
})

test('mid-message /disc adds the skill row after other plugins rows', async ($, on) => {
  on('command.list', () => ({ value: COMMANDS }))
  on('prompt.autocomplete', () => ({ suggestions: [{ text: 'other' }] }))

  const result = await ($ as unknown as Autocomplete).prompt.autocomplete(box('please run /disc'))

  expect(result.suggestions[0]).toEqual({ text: 'other' })
  expect(result.suggestions[1]).toEqual({
    text: '/design-discuss ',
    label: '/design-discuss',
    description: 'Talk a design through before coding',
  })
})

test('a slash at the start of the input is left to the native menu', async ($, on) => {
  on('command.list', () => ({ value: COMMANDS }))
  on('prompt.autocomplete', () => ({ suggestions: [] }))

  const result = await ($ as unknown as Autocomplete).prompt.autocomplete(box('  /disc'))

  expect(result.suggestions).toEqual([])
})

test('/notes finds skills whose name has a notes part', () => {
  const list = [user('release-notes'), user('meeting-notes'), user('code-review')]
  expect(rankSkills(list, 'notes').map(c => c.name)).toEqual(['meeting-notes', 'release-notes'])
})

test('/hellowo finds my-hello-world by letters in order', () => {
  const list = [user('my-hello-world'), user('code-review')]
  expect(rankSkills(list, 'hellowo').map(c => c.name)).toEqual(['my-hello-world'])
})

test('a fuzzy match at word starts ranks above a scattered one', () => {
  const list = [user('recursion'), user('return'), user('release-notes')]
  expect(rankSkills(list, 'rn').map(c => c.name)).toEqual(['release-notes', 'return', 'recursion'])
})

test('a query whose letters are not all in the name, in order, matches nothing', () => {
  const list = [user('release-notes'), user('meeting-notes'), user('code-review')]
  expect(rankSkills(list, 'xyz')).toEqual([])
  expect(rankSkills(list, 'notesr')).toEqual([])
})

test('a description match ranks after a weak fuzzy name match', () => {
  const list = [user('notes', 'create a note'), user('recursion')]
  expect(rankSkills(list, 'cr').map(c => c.name)).toEqual(['recursion', 'notes'])
})

test('a whole-name prefix ranks above a later name-part prefix', () => {
  const list = [user('code-review'), user('review-checklist')]
  expect(rankSkills(list, 'rev').map(c => c.name)).toEqual(['review-checklist', 'code-review'])
})
