import { readFileSync } from 'node:fs'

import { test, expect } from '@playwright/test'

import { definitions } from '../src/codes.js'

test('the README tables list every code once, under its check, with the severity and criteria the code gives it', async ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'reads files only, once is enough')
  const lines = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('\n')
  const checks = ['expanded-state', 'modal-walk', 'error-association']
  const headings = lines.flatMap((line, at) => (line.startsWith('## ') ? [{ at, title: line }] : []))
  const sectionOf = (at: number) => headings.filter((heading) => heading.at < at).at(-1)?.title ?? ''
  const rowLike = /^\s*\|\s*`?[a-z0-9-]+\/[^\s|`]+/i
  const row = /^\| `(([a-z-]+)\/[a-z-]+)` \| (failure|warning) \| ([^|]+) \| .+ \|$/
  const rows = lines.flatMap((line, at) => (rowLike.test(line) ? [{ line, at }] : []))
  for (const { line } of rows) expect(line, 'a code row in the README has an unexpected shape').toMatch(row)
  const found = rows.map(({ line, at }) => {
    const [, code, check, severity, criteria] = line.match(row)!
    expect(checks, `${code} names an unknown check`).toContain(check)
    const section = sectionOf(at)
    const owner = { 'expanded-state': 'Expanded state', 'modal-walk': 'A dialog', 'error-association': 'Errors' }[check]
    expect(section, `${code} sits under "${section}"`).toContain(owner)
    return `${code} ${severity} ${criteria.trim()}`
  })
  const expected = Object.entries(definitions).map(
    ([code, { severity, criteria }]) => `${code} ${severity} ${criteria.length ? criteria.join(', ') : 'none'}`,
  )
  expect(found.toSorted()).toEqual(expected.toSorted())
})
